import * as WebBrowser from 'expo-web-browser';
import { AppState } from 'react-native';

const GIVE_UP_AFTER_MS = 15 * 60_000;

/**
 * Open the Selcom checkout page and resolve when the customer is back in the app.
 * iOS resolves when the browser is dismissed; on Android openBrowserAsync resolves as soon as
 * the Custom Tab opens, so we wait for the app to come back to the foreground.
 */
export async function openPaymentPage(url: string): Promise<void> {
  const result = await WebBrowser.openBrowserAsync(url);
  if (result.type !== 'opened') return;
  await new Promise<void>((resolve) => {
    let left = AppState.currentState !== 'active';
    const done = () => {
      sub.remove();
      clearTimeout(timer);
      resolve();
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') left = true;
      else if (left) done();
    });
    const timer = setTimeout(done, GIVE_UP_AFTER_MS);
  });
}
