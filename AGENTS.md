# AGENTS.md — VVA Meet & Ponytail Development Rules

## 1. Operating Mindset (Ponytail Standards)
*You are a pragmatic, senior developer. The best code is the code never written. Solve the whole problem with the least new code.*

### The Smallest Complete Change
1. **YAGNI**: Skip unrequested options, speculative abstractions, wrappers, or "for later" code.
2. **Reuse First**: Check if the codebase already has a helper, component, or pattern before writing new logic.
3. **Platform First**: Prefer native browser APIs (HTML5, Canvas, WebRTC) and standard PHP over third-party packages.
4. **Minimal Working Diff**: The shortest readable diff wins. Never add layers or boilerplate the problem does not need.
5. **Non-Negotiables**: Never cut input validation at trust boundaries, error handling that prevents data loss, security, or accessibility.
6. **Communication**: Keep explanations direct and concise. State what was done, what was skipped or deferred, and any risks.

---

## 2. Project Architecture (VVA Meet)

### Target Environments
- **Production**: BigRock Shared Linux Hosting.
  - Native Apache web server, PHP 8+, MySQL PDO.
  - **Zero Node.js runtime in production**: All backend APIs, signaling fallbacks, and authentication run through PHP.
- **Local Development**:
  - `dev_server.js`: Zero-dependency local Node.js server that runs PHP pages and relays WebSockets/HTTP without external npm dependencies.
  - Port: `3000` (`http://localhost:3000`).

### Core Files
- `index.php`: Landing page, user dashboard, schedule, and meeting room launcher.
- `room.php`: Video conference UI stage, camera preview, video grid, and control dock.
- `login.php`: Authentication portal (login, register, guest entry).
- `config.php`: Environment configuration and dynamic base URL detection.
- `database.php`: Database connection wrapper with MySQL PDO and in-memory mock fallback.
- `api/*.php`: Backend endpoints (`auth.php`, `signal.php`, `sync.php`, `chat.php`, `meetings.php`).
- `js/webrtc.js`: Native WebRTC mesh manager (peer connections, track replacement, camera management).
- `js/room.js`: Main room state controller, MediaPipe background segmentation, toolbar actions.
- `assets/mediapipe/`: Local WebAssembly & neural network models for offline, zero-latency background segmentation.

---

## 3. Video & Media Rules
- **Camera Track Preservation**: Never remove or detach the hardware webcam track from `webrtc.rawCameraStream`. Video filters composite onto `<canvas id="localOutputCanvas">` using `source-out` and `destination-atop` without hiding or pausing `<video id="localVideo">`.
- **Mirroring**: Local webcam preview is mirrored horizontally (`scaleX(-1)`) via CSS; remote feeds and screen shares remain unmirrored (`scaleX(1)`).
- **Audio Autoplay**: Always handle browser autoplay policies by muting preview audio elements and unlocking audio on user click.
