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


def sanitize_filename(name: str) -> str:
    """Convert alt text to a valid filename."""
    # Lowercase and replace spaces/special chars with hyphens
    name = name.lower().strip()
    name = re.sub(r'[^\w\s-]', '', name)
    name = re.sub(r'[-\s]+', '-', name)
    return name or 'image'


def extract_images_from_body(body: str) -> list[dict]:
    """
    Extract image URLs and their alt text from issue body.

    Returns list of dicts with 'url', 'alt_text', and 'uuid' keys.
    """
    images = []

    # Pattern for GitHub user-attachments URLs
    # Matches both markdown image syntax and raw URLs
    attachment_pattern = r'https://github\.com/user-attachments/assets/([a-f0-9-]+)'

    # First try to find markdown images with alt text: ![alt text](url)
    markdown_pattern = r'!\[([^\]]*)\]\((https://github\.com/user-attachments/assets/[a-f0-9-]+)\)'

    seen_uuids = set()

    # Extract markdown images with alt text
    for match in re.finditer(markdown_pattern, body):
        alt_text = match.group(1)
        url = match.group(2)
        uuid = re.search(attachment_pattern, url).group(1)

        if uuid not in seen_uuids:
            seen_uuids.add(uuid)
            images.append({
                'url': url,
                'alt_text': alt_text,
                'uuid': uuid
            })

    # Find any remaining URLs not captured by markdown pattern
    for match in re.finditer(attachment_pattern, body):
        uuid = match.group(1)
        if uuid not in seen_uuids:
            seen_uuids.add(uuid)
            url = f'https://github.com/user-attachments/assets/{uuid}'
            images.append({
                'url': url,
                'alt_text': '',
                'uuid': uuid
            })

    return images


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
    for i, img in enumerate(images, 1):
        # Generate filename
        if img['alt_text']:
            filename = f"{sanitize_filename(img['alt_text'])}.png"
        else:
            filename = f"image-{i}.png"

        output_path = output_dir / filename

        print(f"Downloading {filename}...")
        if download_image(img['url'], output_path):
            downloaded.append(str(output_path))
            print(f"  Saved to {output_path}")
        else:
            print(f"  Failed to download {filename}")

    # Output summary
    print(f"\n{'='*50}")
    print(f"Downloaded {len(downloaded)}/{len(images)} images to {output_dir}/")
    print(f"{'='*50}")

    for path in downloaded:
        print(path)

    return 0 if len(downloaded) == len(images) else 1


if __name__ == '__main__':
    sys.exit(main())
