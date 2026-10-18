import { defineConfig } from '@playwright/test'
import offlineConfig from './playwright.offline.config'

// Invoked only inside the isolated snapshot prepared by review-stage6-approved.py.
export default defineConfig(offlineConfig, { testDir: './tests/stage6-review', outputDir: 'offline-test-results/stage6-approved' })
