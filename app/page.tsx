import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { WorksWith } from '@/components/landing/WorksWith'
import { InsideClaude } from '@/components/landing/InsideClaude'
import { ThreeSurfaces } from '@/components/landing/ThreeSurfaces'
import { MobileShowcase } from '@/components/landing/MobileShowcase'
import { HinglishGallery } from '@/components/landing/HinglishGallery'
import { BentoShowcase } from '@/components/landing/BentoShowcase'
import { ConnectSteps } from '@/components/landing/ConnectSteps'
import { ReviewShowcase } from '@/components/landing/ReviewShowcase'
import { TechStrip } from '@/components/landing/TechStrip'
import { FooterCTA } from '@/components/landing/FooterCTA'

export default function Home() {
  return (
    <main className="min-h-screen bg-bg-primary">
      <Navbar />
      <Hero />
      <WorksWith />
      <InsideClaude />
      <ThreeSurfaces />
      <MobileShowcase />
      <HinglishGallery />
      <BentoShowcase />
      <ConnectSteps />
      <ReviewShowcase />
      <TechStrip />
      <FooterCTA />
    </main>
  )
}
