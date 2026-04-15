import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { ReviewShowcase } from '@/components/landing/ReviewShowcase'
import { TechStrip } from '@/components/landing/TechStrip'
import { FooterCTA } from '@/components/landing/FooterCTA'

export default function Home() {
  return (
    <main className="min-h-screen bg-bg-primary">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <ReviewShowcase />
      <TechStrip />
      <FooterCTA />
    </main>
  )
}
