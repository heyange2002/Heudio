import { createRoot } from "react-dom/client";
import MobileApp from "./MobileApp";
import MobileConnection from "./Connection";
import QQDisplay from "./QQDisplay";
import "./mobile.css";
import "./services.css";
import "./runtime.css";
if (navigator.userAgent.includes("SoundIsleAndroid"))
  document.documentElement.classList.add("native-android");

createRoot(document.getElementById("root")!).render(
  <MobileConnection>
    {location.hash === "#qq-display" ? <QQDisplay /> : <MobileApp />}
  </MobileConnection>,
);
