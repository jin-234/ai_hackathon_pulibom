"""업스테이지 Document OCR / Document Parse 단독 테스트.

사용법:
    pip install requests python-dotenv
    cp ../.env.example ../.env   # UPSTAGE_API_KEY 채우기
    python upstage_test.py ocr   samples/풀이1.png
    python upstage_test.py parse samples/문제지.pdf

결과는 results/<파일명>.<모드>.json 으로 저장된다.
API 사양은 바뀔 수 있으니 업스테이지 콘솔 문서와 꼭 대조할 것.
"""

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

URL = "https://api.upstage.ai/v1/document-digitization"
MODELS = {"ocr": "ocr", "parse": "document-parse"}


def run(mode: str, path: Path) -> dict:
    key = os.environ.get("UPSTAGE_API_KEY")
    if not key:
        sys.exit("UPSTAGE_API_KEY 가 .env 에 없습니다.")
    data = {"model": MODELS[mode]}
    if mode == "parse":
        data["output_formats"] = "['html', 'markdown']"
    with path.open("rb") as f:
        res = requests.post(
            URL,
            headers={"Authorization": f"Bearer {key}"},
            files={"document": f},
            data=data,
            timeout=120,
        )
    res.raise_for_status()
    return res.json()


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in MODELS:
        sys.exit(__doc__)
    mode, path = sys.argv[1], Path(sys.argv[2])
    result = run(mode, path)

    out_dir = Path(__file__).resolve().parent / "results"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{path.stem}.{mode}.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    if mode == "ocr":
        print(result.get("text", ""))
    else:
        print(result.get("content", {}).get("markdown", ""))
    print(f"\n저장: {out}")


if __name__ == "__main__":
    main()
