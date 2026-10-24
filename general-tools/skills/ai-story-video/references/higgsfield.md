# Higgsfield through its Claude connector

The hosted MCP is `https://mcp.higgsfield.ai/mcp` (OAuth sign-in, no key). Its tools arrive deferred;
load the ones you need in one `ToolSearch` call: `balance`, `models_explore`, `generate_video`,
`generate_video_batch`, `jobs_wait`, `media_upload`, `media_confirm`, `manage_reference_elements`,
`transactions`.

## Uploading a local file

1. `media_upload` with `files: [{ filename, content_type }]` (up to 20) returns a presigned
   `upload_url` and a `media_id` for each.
2. PUT the bytes from the machine that has them:
   `curl -X PUT -H "Content-Type: image/jpeg" --data-binary @file.jpg '<upload_url>'` (expect 200).
3. `media_confirm` with `type: "image"` and the `media_ids`.
The URLs last 24 hours. Upload all the keyframes in one go so the PUTs can run in one shell command.

## Submitting

- `generate_video` with `get_cost: true` prices a request without running it.
- The first submit of a prompt can come back with a preset recommendation and no job
  ("Preset ... was recommended instead"). Submit again with `declined_preset_id` set to that id.
- `generate_video_batch` takes up to 12 independent requests; keep the returned job ids.
- `jobs_wait` long-polls up to 12 jobs for 15 s at a time; results carry a CloudFront `result_url`.
  A download can reset; retry it.
- `transactions` lists every spend, to the credit: the record of what a video cost.

## Models seen (October 2026)

| Model | Settings | Cost | Notes |
|---|---|---|---|
| Kling 3.0 Pro (`kling3_0`) | `mode: pro`, `sound: off`, start_image | 1.75 credits a second (8.75 for 5 s) | The default. Holds a stylised 3D face from the keyframe, acts small beats well, 1076 x 1928 at 24 fps |
| Kling 4.0 (`kling4_0`) | `mode: image-to-video`, 1080p | 12 for 6 s | As good on the test; a stronger push-in; adds sound |
| Kling 3.0 Std | `mode: std` | 9 for 6 s | Not tried |
| Seedance 2.0 | `mode: std`, 1080p | 72 for 6 s | Priced, not tried |
| Seedance 2.5 | omni_reference, 1080p | 96 for 6 s | Priced, not tried |

## Saved characters (Elements)

`manage_reference_elements` with `action: create` makes a reusable character from one image (a
character sheet works), instantly and free. Use it in a prompt as `<<<element_id>>>`. Kling 3.0
honours it only with a `start_image` as well. With a keyframe as the start frame the face already
holds, so elements matter most for a shot made without a keyframe.
