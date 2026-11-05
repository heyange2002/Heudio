import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AccessGate from './AccessGate';
import './index.css';

if (window.soundisleWindow) document.documentElement.dataset.desktopPlatform = window.soundisleWindow.platform;

createRoot(document.getElementById('root')!).render(<AccessGate><App /></AccessGate>);
