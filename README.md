# Nodt

생각 하나에서 다음 생각으로 계속 들어가는 미니멀 노트 앱. Windows 데스크톱 앱이고 Tauri 2, React, TypeScript, Vite, Tiptap으로 만든다. 노트는 md 파일로 저장한다.

- 스펙: [docs/SPEC.md](docs/SPEC.md)
- 진행 상황: [docs/PROGRESS.md](docs/PROGRESS.md)
- 확인 체크리스트: [docs/CHECKLIST.md](docs/CHECKLIST.md)
- 디자인 목업: [docs/design/nodt-mockup.html](docs/design/nodt-mockup.html)

## 실행

필요한 것: Node.js, Rust(rustup), Visual Studio C++ Build Tools, WebView2

```powershell
npm install
npm run tauri dev     # 앱 창으로 실행 (데이터: 문서\Nodt)
npm run dev           # 브라우저에서 보기 (http://localhost:1420, ?sample = 샘플 노트)
npm run build         # 타입 검사 + 프론트엔드 빌드
npm run tauri build   # 설치 파일 만들기 (디스크 여유 2GB 이상 필요)
```

## 폴더

| 경로 | 내용 |
|---|---|
| `src/model/` | 노트 모델, 문서 안 링크 다루기, md 변환, 개발용 샘플 |
| `src/state/` | 상태와 동작(reducer) |
| `src/editor/` | Tiptap 확장: 링크 노드, 키, `/` 메뉴, 클립보드 |
| `src/storage/` | 저장: Tauri 명령 연결, 노트 파일 형식, 불러오기와 자동 저장 |
| `src/theme/` | 테마 색 토큰 6종 |
| `src/ui/` | 화면: 캔버스(Workspace), 패널, 에디터, 메뉴, 설정·도움말 |
| `src-tauri/` | Tauri(Rust): 파일 저장, 백업, 창 위치 복원 |
