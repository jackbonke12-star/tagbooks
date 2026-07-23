# Printer LAN setup (run on the computer next to the printer)

The printer can only be *printed to* from a computer on the same WiFi as it.
Run this on that computer (Jackson's Mac).

1. Install Node.js (LTS) from https://nodejs.org if you don't have it.
2. In Terminal:

       git clone https://github.com/jackbonke12-star/tagbooks.git
       cd tagbooks
       bash local-agent/setup-lan.sh

3. It will ask for:
   - **Printer IP** and **Access Code** — on the printer screen: Settings > find the LAN / network section.
   - **Shared secret** — ask Jack for it.
4. Wait ~30 seconds, open the Printer tab in the app — it should show connected.
   Send a sliced **.3mf** (exported from Bambu Studio) and it will print.

It auto-starts on reboot. To stop it: `launchctl unload ~/Library/LaunchAgents/com.tagbooks.printer.plist`
