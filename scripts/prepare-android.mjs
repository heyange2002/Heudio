import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "dist-mobile");
if (!fs.existsSync(path.join(source, "index.html")))
  throw Error("请先运行 npm run mobile:build");
const target = path.join(root, "android/app/src/main/assets");
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
const drawable = path.join(root, "android/app/src/main/res/drawable-nodpi");
fs.mkdirSync(drawable, { recursive: true });
fs.copyFileSync(
  path.join(root, "assets/icons/icon.png"),
  path.join(drawable, "app_icon.png"),
);
console.log("Android 界面资源已同步");
