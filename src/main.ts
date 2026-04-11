import './style.css'
import { App } from './app'

// Entry point — initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App()
  app.init()
})
