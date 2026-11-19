# ai-test

앱에 붙이기 전에 AI API를 단독으로 검증하는 곳.

- `samples/`: 테스트용 손글씨·문제지 이미지 (gitignore, 실제 학생 자료 금지)
- `results/`: API 응답 JSON (gitignore)

```bash
pip install requests python-dotenv
python upstage_test.py ocr   samples/풀이1.png
python upstage_test.py parse samples/문제지.pdf
```

검증 결과 요약(인식률, 잘 틀리는 기호 등)은 이 파일 아래에 적어주세요.

## 검증 기록

| 날짜 | 모델 | 샘플 | 결과 메모 |
|---|---|---|---|
