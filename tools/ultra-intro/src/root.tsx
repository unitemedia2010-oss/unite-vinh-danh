import { Composition } from 'remotion'
import { UniteUltraIntro } from './unite-ultra-intro'

export const UltraIntroRoot = () => (
  <Composition
    id="UniteUltraIntro"
    component={UniteUltraIntro}
    durationInFrames={87}
    fps={30}
    width={1920}
    height={1080}
  />
)
