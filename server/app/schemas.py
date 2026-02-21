from typing import Optional
from pydantic import BaseModel, Field


class PromptCleanRequest(BaseModel):
    prompt: str
    style: str = Field(
        default="architectural",
        pattern="^(architectural|modern|classical|futuristic)$"
    )


class PromptCleanResponse(BaseModel):
    original_prompt: str
    cleaned_prompt: str
    dalle_prompt: str
    short_name: str
    style_tags: list[str]


class ImageGenerateRequest(BaseModel):
    prompt: str
    num_images: int = Field(default=1, ge=1, le=4)
    size: str = "1024x1024"
    quality: str = Field(default="hd", pattern="^(standard|hd)$")
    style: str = Field(default="natural", pattern="^(natural|vivid)$")


class ImageGenerateResponse(BaseModel):
    images: list[str]
    prompt_used: str
    preview_3d_url: Optional[str] = None


class TrellisRequest(BaseModel):
    image_url: Optional[str] = None
    image_urls: Optional[list[str]] = None
    use_multi: bool = False
    seed: Optional[int] = None
    texture_size: int = Field(default=1024, ge=512, le=2048)
    mesh_simplify: float = Field(default=0.95, ge=0.9, le=0.98)
    ss_guidance_strength: float = Field(default=7.5, ge=0, le=10)
    slat_guidance_strength: float = Field(default=3.0, ge=0, le=10)


class TrellisResponse(BaseModel):
    model_url: str
    file_name: str
    format: str
    generation_time: float


class PipelineRequest(BaseModel):
    prompt: str
    style: str = Field(
        default="architectural",
        pattern="^(architectural|modern|classical|futuristic)$"
    )
    num_views: int = Field(default=6, ge=1, le=6)
    texture_size: int = Field(default=1024, ge=512, le=2048)
    high_quality: bool = True


class PipelineResponse(BaseModel):
    job_id: str
    status: str
    original_prompt: str
    cleaned_prompt: str
    dalle_prompt: str
    image_urls: list[str]
    model_url: Optional[str] = None
    model_file: Optional[str] = None
    download_url: Optional[str] = None
    total_time: float
    stages: dict


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: int = Field(ge=0, le=100)
    message: str
    result: Optional[PipelineResponse] = None


class UploadResponse(BaseModel):
    status: str
    input_file: str
    model_url: str
    model_file: str
    download_url: str
    format: str
    generation_time: float


class PreviewRequest(BaseModel):
    prompt: str
    style: str = Field(
        default="architectural",
        pattern="^(architectural|modern|classical|futuristic)$"
    )
    num_views: int = Field(default=6, ge=1, le=6)
    high_quality: bool = True


class PreviewResponse(BaseModel):
    job_id: str
    status: str
    original_prompt: str
    cleaned_prompt: str
    dalle_prompt: str
    short_name: str
    image_urls: list[str]
    preview_3d_url: Optional[str] = None
    message: str


class Start3DRequest(BaseModel):
    job_id: str
    image_urls: list[str]
    texture_size: int = Field(default=1024, ge=512, le=2048)
    use_multi: bool = False


class ThreeDJobStatus(BaseModel):
    job_id: str
    status: str
    progress: int = Field(ge=0, le=100)
    message: str
    model_url: Optional[str] = None
    model_file: Optional[str] = None
    download_url: Optional[str] = None
    generation_time: Optional[float] = None


class ActiveJob(BaseModel):
    job_id: str
    type: str
    status: str
    progress: int = Field(ge=0, le=100)
    message: str


class ActiveJobsResponse(BaseModel):
    total_active: int
    image_jobs: int
    three_d_jobs: int
    pipeline_jobs: int
    jobs: list[ActiveJob]
