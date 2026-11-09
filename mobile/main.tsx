import { createRoot } from "react-dom/client";
import MobileApp from "./MobileApp";
import MobileConnection from "./Connection";
import QQDisplay from "./QQDisplay";
import "./mobile.css";
import "./services.css";
import "./runtime.css";
if (navigator.userAgent.includes("SoundIsleAndroid"))
  document.documentElement.classList.add("native-android");

const viewer =
  location.hash === "#qq-display" || location.pathname === "/mobile/qq-display";
createRoot(document.getElementById("root")!).render(
  viewer ? (
    <QQDisplay />
  ) : (
    <MobileConnection>
      <MobileApp />
    </MobileConnection>
  ),
);
