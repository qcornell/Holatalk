/**
 * The owner build: the app owner's own copy, built with `eas build --profile owner` and sent only
 * to his phone through TestFlight. It skips the App Store plans; calls go through the Hola server
 * with the owner code typed in Settings (the server's TEAMMATE_ACCESS_CODES). The App Store build
 * never has this switch on, so nothing in it unlocks Ana without an App Store plan.
 */
export const OWNER_BUILD = process.env.EXPO_PUBLIC_OWNER_BUILD === '1';
