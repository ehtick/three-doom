// Browser-specific destination shown after the player confirms Quit.
export const QUIT_LINK = 'https://x.com/mrdoob/status/2054075364432031991';
export const QUIT_CONFIRM_KEY = 0x79; // lowercase y

export function M_ConfirmQuit(key, state, openTab, quit) {
  if (key !== QUIT_CONFIRM_KEY) return false;

  // Keep this synchronous: browsers grant popup permission only while the
  // keyboard/click user activation is still on the stack. A blocked or failed
  // popup must not prevent Doom's normal shutdown path.
  if (state.linkOpened !== true) {
    state.linkOpened = true;
    try {
      if (typeof openTab === 'function') {
        openTab(QUIT_LINK, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Continue quitting even when the browser refuses the new tab.
    }
  }
  quit();
  return true;
}
