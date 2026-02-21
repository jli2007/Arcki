import time
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks

from ..services import OpenAIService, FalService, get_job_store
from ..schemas import (
    PromptCleanRequest,
    PromptCleanResponse,
    ImageGenerateRequest,
    ImageGenerateResponse,
    TrellisRequest,
    TrellisResponse,
    PipelineRequest,
    PipelineResponse,
    JobStatus,
    PreviewRequest,
    PreviewResponse,
    Start3DRequest,
    ThreeDJobStatus,
    ActiveJob,
    ActiveJobsResponse,
)

router = APIRouter(tags=["Generation"])

PREFIX_PIPELINE = "pipeline"
PREFIX_3D = "3d"
PREFIX_IMAGE = "image"

JOB_TTL = 7200


def get_pipeline_job(job_id: str) -> JobStatus | None:
    store = get_job_store()
    data = store.get(PREFIX_PIPELINE, job_id)
    if data:
        return JobStatus(**data)
    return None


def set_pipeline_job(job: JobStatus) -> None:
    store = get_job_store()
    store.set(PREFIX_PIPELINE, job.job_id, job.model_dump(), JOB_TTL)


def get_3d_job(job_id: str) -> ThreeDJobStatus | None:
    store = get_job_store()
    data = store.get(PREFIX_3D, job_id)
    if data:
        return ThreeDJobStatus(**data)
    return None


def set_3d_job(job: ThreeDJobStatus) -> None:
    store = get_job_store()
    store.set(PREFIX_3D, job.job_id, job.model_dump(), JOB_TTL)


def delete_3d_job(job_id: str) -> None:
    store = get_job_store()
    store.delete(PREFIX_3D, job_id)


def get_image_job(job_id: str) -> dict | None:
    store = get_job_store()
    return store.get(PREFIX_IMAGE, job_id)


def set_image_job(job_id: str, data: dict) -> None:
    store = get_job_store()
    store.set(PREFIX_IMAGE, job_id, data, JOB_TTL)


def delete_image_job(job_id: str) -> None:
    store = get_job_store()
    store.delete(PREFIX_IMAGE, job_id)


def delete_pipeline_job(job_id: str) -> None:
    store = get_job_store()
    store.delete(PREFIX_PIPELINE, job_id)


@router.post("/clean-prompt", response_model=PromptCleanResponse)
async def clean_prompt(request: PromptCleanRequest):
    openai_svc = OpenAIService()
    if not openai_svc.is_configured:
        raise HTTPException(status_code=503, detail="OpenAI not configured. Set OPENAI_API_KEY.")

    try:
        return await openai_svc.clean_prompt(request.prompt, request.style)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prompt cleaning failed: {e}")


@router.post("/generate-image", response_model=ImageGenerateResponse)
async def generate_image(request: ImageGenerateRequest):
    openai_svc = OpenAIService()
    if not openai_svc.is_configured:
        raise HTTPException(status_code=503, detail="OpenAI not configured. Set OPENAI_API_KEY.")

    try:
        return await openai_svc.generate_images(
            prompt=request.prompt,
            num_images=request.num_images,
            size=request.size,
            quality=request.quality,
            style=request.style
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {e}")


@router.post("/generate-3d", response_model=TrellisResponse)
async def generate_3d(request: TrellisRequest):
    fal_svc = FalService()
    if not fal_svc.is_configured:
        raise HTTPException(status_code=503, detail="fal.ai not configured. Set FAL_KEY.")

    if not request.image_url and not request.image_urls:
        raise HTTPException(status_code=400, detail="Must provide image_url or image_urls")

    try:
        return await fal_svc.generate_3d(
            image_url=request.image_url,
            image_urls=request.image_urls,
            use_multi=request.use_multi,
            seed=request.seed,
            texture_size=request.texture_size,
            mesh_simplify=request.mesh_simplify,
            ss_guidance_strength=request.ss_guidance_strength,
            slat_guidance_strength=request.slat_guidance_strength
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"3D generation failed: {e}")


async def _run_pipeline_async(job_id: str, request: PipelineRequest):
    openai_svc = OpenAIService()
    fal_svc = FalService()

    job = JobStatus(
        job_id=job_id,
        status="pending",
        progress=0,
        message="Starting pipeline..."
    )
    set_pipeline_job(job)

    try:
        job.status = "cleaning_prompt"
        job.progress = 10
        job.message = "Cleaning prompt with AI..."
        set_pipeline_job(job)

        clean_result = await openai_svc.clean_prompt(request.prompt, request.style)

        job.status = "generating_images"
        job.progress = 30
        job.message = "Generating 2D images with DALL-E..."
        set_pipeline_job(job)

        image_result = await openai_svc.generate_images(
            prompt=clean_result.dalle_prompt,
            num_images=request.num_views,
            quality="hd" if request.high_quality else "standard"
        )

        job.status = "generating_3d"
        job.progress = 60
        job.message = "Generating 3D model with Trellis..."
        set_pipeline_job(job)

        use_multi = request.num_views > 1 and len(image_result.images) > 1

        trellis_result = await fal_svc.generate_3d(
            image_url=image_result.images[0] if not use_multi else None,
            image_urls=image_result.images if use_multi else None,
            use_multi=use_multi,
            texture_size=request.texture_size
        )

        job.status = "completed"
        job.progress = 100
        job.message = "3D model ready!"
        job.result = PipelineResponse(
            job_id=job_id,
            status="completed",
            original_prompt=request.prompt,
            cleaned_prompt=clean_result.cleaned_prompt,
            dalle_prompt=clean_result.dalle_prompt,
            image_urls=image_result.images,
            model_url=trellis_result.model_url,
            model_file=trellis_result.file_name,
            download_url=f"/download/{trellis_result.file_name}",
            total_time=0,
            stages={}
        )
        set_pipeline_job(job)

    except Exception as e:
        job.status = "failed"
        job.progress = 0
        job.message = f"Error: {e}"
        set_pipeline_job(job)


@router.post("/generate-architecture-async")
async def generate_architecture_async(
    request: PipelineRequest,
    background_tasks: BackgroundTasks
):
    openai_svc = OpenAIService()
    fal_svc = FalService()

    if not openai_svc.is_configured:
        raise HTTPException(status_code=503, detail="OpenAI not configured")
    if not fal_svc.is_configured:
        raise HTTPException(status_code=503, detail="fal.ai not configured")

    job_id = uuid.uuid4().hex
    background_tasks.add_task(_run_pipeline_async, job_id, request)

    return {
        "job_id": job_id,
        "status": "started",
        "poll_url": f"/job/{job_id}"
    }


@router.get("/job/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    job = get_pipeline_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/generate-preview", response_model=PreviewResponse)
async def generate_preview(request: PreviewRequest):
    openai_svc = OpenAIService()

    if not openai_svc.is_configured:
        raise HTTPException(status_code=503, detail="OpenAI not configured")

    job_id = uuid.uuid4().hex

    set_image_job(job_id, {
        "job_id": job_id,
        "status": "generating",
        "progress": 10,
        "message": "Cleaning prompt..."
    })

    try:
        clean_result = await openai_svc.clean_prompt(request.prompt, request.style)

        set_image_job(job_id, {
            "job_id": job_id,
            "status": "generating",
            "progress": 30,
            "message": f"Generating {request.num_views} image(s) with DALL-E..."
        })

        image_result = await openai_svc.generate_images(
            prompt=clean_result.dalle_prompt,
            num_images=request.num_views,
            quality="hd" if request.high_quality else "standard"
        )

        delete_image_job(job_id)

        return PreviewResponse(
            job_id=job_id,
            status="images_ready",
            original_prompt=request.prompt,
            cleaned_prompt=clean_result.cleaned_prompt,
            dalle_prompt=clean_result.dalle_prompt,
            short_name=clean_result.short_name,
            image_urls=image_result.images,
            preview_3d_url=image_result.preview_3d_url,
            message="2D images ready! Click Finish to generate 3D model."
        )

    except Exception as e:
        delete_image_job(job_id)
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {e}")


async def _run_3d_generation(job_id: str, image_urls: list[str], texture_size: int, use_multi: bool):
    fal_svc = FalService()

    job = ThreeDJobStatus(
        job_id=job_id,
        status="generating",
        progress=10,
        message="Starting 3D model generation..."
    )
    set_3d_job(job)

    try:
        start_time = time.time()

        job.progress = 30
        job.message = "Processing images with Trellis..."
        set_3d_job(job)

        result = await fal_svc.generate_3d(
            image_url=image_urls[0] if not use_multi else None,
            image_urls=image_urls if use_multi else None,
            use_multi=use_multi,
            texture_size=texture_size
        )

        generation_time = time.time() - start_time

        job.status = "completed"
        job.progress = 100
        job.message = "3D model ready!"
        job.model_url = result.model_url
        job.model_file = result.file_name
        job.download_url = f"/download/{result.file_name}"
        job.generation_time = generation_time
        set_3d_job(job)

    except Exception as e:
        job.status = "failed"
        job.progress = 0
        job.message = f"Error: {e}"
        set_3d_job(job)


@router.post("/start-3d")
async def start_3d_generation(
    request: Start3DRequest,
    background_tasks: BackgroundTasks
):
    fal_svc = FalService()

    if not fal_svc.is_configured:
        raise HTTPException(status_code=503, detail="fal.ai not configured")

    if not request.image_urls:
        raise HTTPException(status_code=400, detail="No images provided")

    job = ThreeDJobStatus(
        job_id=request.job_id,
        status="pending",
        progress=0,
        message="Queued for 3D generation..."
    )
    set_3d_job(job)

    use_multi = request.use_multi and len(request.image_urls) > 1

    background_tasks.add_task(
        _run_3d_generation,
        request.job_id,
        request.image_urls,
        request.texture_size,
        use_multi
    )

    return {
        "job_id": request.job_id,
        "status": "started",
        "poll_url": f"/3d-job/{request.job_id}"
    }


@router.get("/3d-job/{job_id}", response_model=ThreeDJobStatus)
async def get_3d_job_status(job_id: str):
    job = get_3d_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="3D job not found")
    return job


@router.get("/jobs", response_model=ActiveJobsResponse)
async def list_active_jobs():
    store = get_job_store()
    active_jobs: list[ActiveJob] = []

    for job_data in store.get_all(PREFIX_IMAGE):
        active_jobs.append(ActiveJob(
            job_id=job_data["job_id"],
            type="image",
            status=job_data["status"],
            progress=job_data["progress"],
            message=job_data["message"]
        ))

    for job_data in store.get_all(PREFIX_3D):
        if job_data["status"] in ("pending", "generating"):
            active_jobs.append(ActiveJob(
                job_id=job_data["job_id"],
                type="3d",
                status=job_data["status"],
                progress=job_data["progress"],
                message=job_data["message"]
            ))

    for job_data in store.get_all(PREFIX_PIPELINE):
        if job_data["status"] not in ("completed", "failed"):
            active_jobs.append(ActiveJob(
                job_id=job_data["job_id"],
                type="pipeline",
                status=job_data["status"],
                progress=job_data["progress"],
                message=job_data["message"]
            ))

    image_count = sum(1 for j in active_jobs if j.type == "image")
    three_d_count = sum(1 for j in active_jobs if j.type == "3d")
    pipeline_count = sum(1 for j in active_jobs if j.type == "pipeline")

    active_jobs.sort(key=lambda j: j.progress)

    return ActiveJobsResponse(
        total_active=len(active_jobs),
        image_jobs=image_count,
        three_d_jobs=three_d_count,
        pipeline_jobs=pipeline_count,
        jobs=active_jobs
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    cancelled = False
    job_type = None

    job_3d = get_3d_job(job_id)
    if job_3d and job_3d.status in ("pending", "generating"):
        delete_3d_job(job_id)
        cancelled = True
        job_type = "3d"

    if get_image_job(job_id):
        delete_image_job(job_id)
        cancelled = True
        job_type = "image"

    job_pipeline = get_pipeline_job(job_id)
    if job_pipeline and job_pipeline.status not in ("completed", "failed"):
        delete_pipeline_job(job_id)
        cancelled = True
        job_type = "pipeline"

    if not cancelled:
        raise HTTPException(status_code=404, detail="Active job not found")

    return {"status": "cancelled", "job_id": job_id, "type": job_type}


@router.delete("/jobs/cleanup")
async def cleanup_finished_jobs():
    store = get_job_store()
    three_d_deleted = 0
    pipeline_deleted = 0

    for job_data in store.get_all(PREFIX_3D):
        if job_data["status"] in ("completed", "failed"):
            delete_3d_job(job_data["job_id"])
            three_d_deleted += 1

    for job_data in store.get_all(PREFIX_PIPELINE):
        if job_data["status"] in ("completed", "failed"):
            delete_pipeline_job(job_data["job_id"])
            pipeline_deleted += 1

    return {
        "status": "cleaned",
        "three_d_jobs_removed": three_d_deleted,
        "pipeline_jobs_removed": pipeline_deleted
    }
