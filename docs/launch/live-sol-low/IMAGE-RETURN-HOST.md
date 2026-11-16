# T3 image-return host prerequisite — primary check, RC02

This is a **capability check**, with no new gameplay or viewed-player credit.
The normal Windows/GTX1650Ti production-package path remains functional.

After the realtime GPU diagnostic released its slot, primary called `html_preview`
with an existing original pilot PNG at960x540. The tool failed before rendering:

> This host is missing libraries T3's browser needs (libnspr4.so, libnss3.so,
> libnssutil3.so, libatk-1.0.so.0, libatk-bridge-2.0.so.0, libXcomposite.so.1,
> libXdamage.so.1, libXfixes.so.3, libXrandr.so.2, libgbm.so.1,
> libxkbcommon.so.0, libasound.so.2, libatspi.so.0).

The tool supplied this exact host setup command:

```sh
sudo /home/knotzuni/.t3/wsl-runtime/sha256-0141025335da334759cecd8db3483e09772f3600ca03674698524e7d94291362/t3 browser setup --base-dir /home/knotzuni/.t3
```

Primary tried that command with `sudo -n`. It exited1: `sudo: a password is
required`. A secure file-delivery credential card for that command timed out after
60seconds without an answer. No credential was received, no install ran, and no
second card was opened. The timeout supplied no credential, so setup could not continue.

This identifies a repairable prerequisite for the already exposed image-returning
interface. It does **not** prove that repairing it will produce actual NVIDIA
rendering, attach to the existing Windows pipe, eliminate capture latency, or meet
10-second actual-view/acknowledgment timing. No HTTP capture adapter was implemented
and no new player pilot was run. Historical failed pilots remain excluded.

After host setup, first repeat the static image-return check. Only if that works
should a bounded direct capture/image-return path be implemented and measured.
An actual gameplay pilot still needs the shared GPU-slot handoff, honest PNG/notes,
source/harness/package proof and the unchanged cadence audit. Terra Medium remains
the chosen player and final player credit is0/60.
