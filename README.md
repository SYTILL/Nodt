# Nodt

생각 하나에서 다음 생각으로 계속 들어가는 미니멀 노트 앱. Windows 데스크톱 앱이고 Tauri 2, React, TypeScript, Vite로 만든다.

- 스펙: [docs/SPEC.md](docs/SPEC.md)
- 진행 상황: [docs/PROGRESS.md](docs/PROGRESS.md)
- 디자인 목업: [docs/design/nodt-mockup.html](docs/design/nodt-mockup.html)

## 실행

필요한 것: Node.js, Rust(rustup), Visual Studio C++ Build Tools, WebView2

```powershell
npm install
npm run tauri dev     # 앱 창으로 실행
npm run dev           # 브라우저에서 화면만 보기 (http://localhost:1420)
npm run build         # 타입 검사 + 프론트엔드 빌드
```

## 폴더

| 경로 | 내용 |
|---|---|
| `src/model/` | 노트 모델, 링크 파싱, 트리 계산, 임시 샘플 데이터 |
| `src/state/` | 화면 상태와 동작 (열림, 선택, 패널이동모드, 설정) |
| `src/theme/` | 테마 색 토큰 6종 |
| `src/ui/` | 패널 영역(Workspace), 패널, 본문, 오버레이 |
| `src-tauri/` | Tauri(Rust) 쪽 |
