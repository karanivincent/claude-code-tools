#!/usr/bin/env python3
"""
Fetch images from GitHub issues.

Downloads images attached to GitHub issues using authenticated gh CLI,
saves them to docs/designs/issue-{number}/, and outputs the file paths.

Usage:
    python fetch_issue_images.py <issue_number> --repo <owner/repo> [--output-dir <path>]

Examples:
    python fetch_issue_images.py 60 --repo goyond/frontend-monorepo
    python fetch_issue_images.py 60 --repo goyond/frontend-monorepo --output-dir ./docs/designs
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

GENERIC_ALT_TEXTS = {
    'image', 'screenshot', 'screen shot', 'img', 'photo',
    'picture', 'untitled', 'alt text',
}


def sanitize_filename(name: str) -> str:
    """Convert text to a valid filename."""
    # Lowercase and replace spaces/special chars with hyphens
    name = name.lower().strip()
    name = re.sub(r'[^\w\s-]', '', name)
    name = re.sub(r'[-\s]+', '-', name)
    name = name.strip('-')
    return name or 'image'


def find_context_above(body: str, position: int) -> tuple[str, str]:
    """
    Walk backwards from an image's position to find contextual naming info.

    Returns (heading_context, text_context) — either may be empty.
    """
    text_before = body[:position]
    lines = text_before.split('\n')

    heading_context = ''
    text_context = ''

    for line in reversed(lines):
        stripped = line.strip()
        if not stripped:
            continue

        # Check for markdown heading
        heading_match = re.match(r'^#{1,6}\s+(.+)$', stripped)
        if heading_match and not heading_context:
            heading_context = heading_match.group(1).strip()
            # Once we have both, stop early
            if text_context:
                break
            continue

        # Skip image lines and horizontal rules
        if stripped.startswith('![') or re.match(r'^---+$|^\*\*\*+$|^___+$', stripped):
            continue

        # Use as text context if we don't have one yet
        if not text_context:
            text_context = stripped
            if heading_context:
                break

    return (heading_context, text_context)


def derive_name_from_context(heading: str, text: str) -> str:
    """
    Derive a filename from heading or text context.

    Uses heading first, text second. Strips markdown formatting,
    truncates to first 5 words, and sanitizes.
    """
    source = heading or text
    if not source:
        return ''

    # Strip markdown formatting: bold, italic, links, inline code
    source = re.sub(r'\*\*(.+?)\*\*', r'\1', source)
    source = re.sub(r'\*(.+?)\*', r'\1', source)
    source = re.sub(r'`(.+?)`', r'\1', source)
    source = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', source)

    # Truncate to first 5 words
    words = source.split()[:5]
    truncated = ' '.join(words)

    return sanitize_filename(truncated)


def extract_images_from_body(body: str) -> list[dict]:
    """
    Extract image URLs, alt text, and context from issue body.

    Returns list of dicts with 'url', 'alt_text', 'uuid', 'position',
    'heading_context', and 'text_context' keys.
    """
    images = []

    # Pattern for GitHub user-attachments URLs
    attachment_pattern = r'https://github\.com/user-attachments/assets/([a-f0-9-]+)'

    # Markdown images with alt text: ![alt text](url)
    markdown_pattern = r'!\[([^\]]*)\]\((https://github\.com/user-attachments/assets/[a-f0-9-]+)\)'

    seen_uuids = set()

    # Extract markdown images with alt text
    for match in re.finditer(markdown_pattern, body):
        alt_text = match.group(1)
        url = match.group(2)
        uuid = re.search(attachment_pattern, url).group(1)
        position = match.start()

        if uuid not in seen_uuids:
            seen_uuids.add(uuid)
            heading_ctx, text_ctx = find_context_above(body, position)
            images.append({
                'url': url,
                'alt_text': alt_text,
                'uuid': uuid,
                'position': position,
                'heading_context': heading_ctx,
                'text_context': text_ctx,
            })

    # Find any remaining URLs not captured by markdown pattern
    for match in re.finditer(attachment_pattern, body):
        uuid = match.group(1)
        if uuid not in seen_uuids:
            seen_uuids.add(uuid)
            position = match.start()
            heading_ctx, text_ctx = find_context_above(body, position)
            url = f'https://github.com/user-attachments/assets/{uuid}'
            images.append({
                'url': url,
                'alt_text': '',
                'uuid': uuid,
                'position': position,
                'heading_context': heading_ctx,
                'text_context': text_ctx,
            })

    return images


def deduplicate_name(base_name: str, used_names: dict[str, int]) -> str:
    """
    Return a unique name, appending -2, -3, etc. if already used.

    Tracks counts in used_names dict (mutated in place).
    """
    if base_name not in used_names:
        used_names[base_name] = 1
        return base_name

    used_names[base_name] += 1
    return f"{base_name}-{used_names[base_name]}"


def fetch_issue_body(issue_number: int, repo: str) -> str:
    """Fetch issue body using gh CLI."""
    try:
        result = subprocess.run(
            ['gh', 'issue', 'view', str(issue_number), '--repo', repo, '--json', 'body'],
            capture_output=True,
            text=True,
            check=True
        )
        data = json.loads(result.stdout)
        return data.get('body', '')
    except subprocess.CalledProcessError as e:
        print(f"Error fetching issue: {e.stderr}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print("Error parsing issue data", file=sys.stderr)
        sys.exit(1)


def download_image(url: str, output_path: Path) -> bool:
    """Download image using gh api with authentication."""
    try:
        result = subprocess.run(
            ['gh', 'api', '-H', 'Accept: application/octet-stream', url],
            capture_output=True,
            check=True
        )
        output_path.write_bytes(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error downloading {url}: {e.stderr.decode()}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Fetch images from GitHub issues'
    )
    parser.add_argument('issue_number', type=int, help='GitHub issue number')
    parser.add_argument('--repo', required=True, help='Repository (owner/repo)')
    parser.add_argument('--output-dir', default='docs/designs', help='Output directory (default: docs/designs)')

    args = parser.parse_args()

    # Fetch issue body
    print(f"Fetching issue #{args.issue_number} from {args.repo}...")
    body = fetch_issue_body(args.issue_number, args.repo)

    # Extract images
    images = extract_images_from_body(body)

    if not images:
        print("No images found in this issue.")
        sys.exit(0)

    print(f"Found {len(images)} image(s)")

    # Create output directory
    output_dir = Path(args.output_dir) / f"issue-{args.issue_number}"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Download images
    downloaded = []
    generically_named = []
    used_names: dict[str, int] = {}

    for i, img in enumerate(images, 1):
        # Naming priority chain:
        # 1. Alt text (only if not generic)
        # 2. Context name from heading/text above the image
        # 3. Fallback: image-{n}
        is_generic = False
        alt = img['alt_text'].strip()

        if alt and alt.lower() not in GENERIC_ALT_TEXTS:
            base_name = sanitize_filename(alt)
            naming_source = 'alt_text'
        else:
            context_name = derive_name_from_context(
                img['heading_context'], img['text_context']
            )
            if context_name and context_name != 'image':
                base_name = context_name
                naming_source = 'context'
            else:
                base_name = f"image-{i}"
                naming_source = 'fallback'
                is_generic = True

        unique_name = deduplicate_name(base_name, used_names)
        filename = f"{unique_name}.png"
        output_path = output_dir / filename

        print(f"Downloading {filename} (source: {naming_source})...")
        if download_image(img['url'], output_path):
            downloaded.append(str(output_path))
            if is_generic:
                generically_named.append(str(output_path))
            print(f"  Saved to {output_path}")
        else:
            print(f"  Failed to download {filename}")

    # Output summary
    print(f"\n{'='*50}")
    print(f"Downloaded {len(downloaded)}/{len(images)} images to {output_dir}/")
    print(f"{'='*50}")

    for path in downloaded:
        print(path)

    # Structured output for Claude to parse
    result = {
        'generically_named': generically_named,
        'all_downloaded': downloaded,
        'output_dir': str(output_dir),
    }
    print(f"\n--- IMAGE_DOWNLOAD_RESULT ---")
    print(json.dumps(result))
    print(f"--- END_IMAGE_DOWNLOAD_RESULT ---")

    return 0 if len(downloaded) == len(images) else 1


if __name__ == '__main__':
    sys.exit(main())
