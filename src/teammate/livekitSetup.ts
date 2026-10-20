/**
 * LiveKit needs its WebRTC globals before anything else touches it. Imported first in index.ts.
 * On iOS this also manages the audio session while a Teammate call runs (speakerphone, echo cancel).
 */
import { registerGlobals } from '@livekit/react-native';

registerGlobals();
