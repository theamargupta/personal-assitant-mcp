import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { WorksWith } from '@/components/landing/WorksWith'
import { BentoShowcase } from '@/components/landing/BentoShowcase'
import { ConversationExamples } from '@/components/landing/ConversationExamples'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { ReviewShowcase } from '@/components/landing/ReviewShowcase'
import { TechStrip } from '@/components/landing/TechStrip'
import { FooterCTA } from '@/components/landing/FooterCTA'

export default function Home() {
  return (
    <main className="min-h-screen bg-bg-primary">
      <Navbar />
      <Hero />
      <WorksWith />
      <BentoShowcase />
      <ConversationExamples />
      <HowItWorks />
      <ReviewShowcase />
      <TechStrip />
      <FooterCTA />
    </main>
  )
}
