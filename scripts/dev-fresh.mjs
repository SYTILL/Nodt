// npm run dev:fresh — 완전 처음 켠 상태로 앱을 띄운다.
// 임시 폴더(%TEMP%\nodt-fresh)를 비우고 데이터 폴더와 설정 폴더로 써서, 진짜 노트(문서\Nodt)와 설정은 건드리지 않는다.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(tmpdir(), "nodt-fresh");
rmSync(root, { recursive: true, force: true });
console.log(`처음 상태로 켭니다: ${root}`);

const child = spawn("npm", ["run", "tauri", "dev"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODT_DATA_DIR: join(root, "data"), NODT_CONFIG_DIR: join(root, "cfg") },
});
child.on("exit", (code) => process.exit(code ?? 0));
