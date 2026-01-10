import torch

from shap_e.diffusion.sample import sample_latents
from shap_e.diffusion.gaussian_diffusion import diffusion_from_config
from shap_e.models.download import load_model, load_config
from shap_e.util.notebooks import decode_latent_mesh

# Use CPU instead of MPS due to float64 compatibility issues
device = torch.device("cpu")
print("Using device: cpu (MPS not supported due to float64 limitations)")

# Load pretrained models and diffusion config
xm = load_model("transmitter", device=device)
model = load_model("text300M", device=device)
diffusion = diffusion_from_config(load_config("diffusion"))

# Prompt
prompt = (
    "A futuristic ultra-modern skyscraper, tall and slender, "
    "with reflective blue glass, intricate steel framework, rooftop gardens with trees and terraces, "
    "curved organic architecture, well-defined windows, realistic lighting, photorealistic 3D render"
)


# Generate latents
latents = sample_latents(
    batch_size=1,
    model=model,
    diffusion=diffusion,
    guidance_scale=15.0,
    model_kwargs=dict(texts=[prompt]),
    progress=True,
    clip_denoised=True,
    use_fp16=False,
    use_karras=True,
    karras_steps=64,
    sigma_min=1e-3,
    sigma_max=160,
    s_churn=0,
)

# Decode and save 3D mesh
mesh = decode_latent_mesh(xm, latents[0]).tri_mesh()
with open("buildings.obj", "w") as f:
    mesh.write_obj(f)

print("Saved building.obj")