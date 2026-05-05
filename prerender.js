import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import express from 'express';
import { blogPosts } from './src/data/blogPosts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const staticRoutes = [
  '/', 
  '/about', 
  '/privacy-policy', 
  '/blog', 
  '/faq', 
  '/how-to-use',
  '/terms',
  '/contact'
];

const dynamicRoutes = blogPosts.map(post => `/blog/${post.slug}`);
const allRoutes = [...staticRoutes, ...dynamicRoutes];

async function prerender() {
  const isVercel = process.env.VERCEL === '1' || process.env.CI === 'true';
  const distPath = path.resolve(__dirname, 'dist');
  
  if (!fs.existsSync(distPath)) {
    console.error('dist directory does not exist. Run npm run build first.');
    process.exit(1);
  }

  // Serve the built app locally
  const app = express();
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
  
  const server = app.listen(8000, () => {
    console.log('Local server running on port 8000 for prerendering');
  });
  
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  } catch (err) {
    console.warn('\n⚠️  WARNING: Could not launch browser for pre-rendering.');
    console.warn('This usually happens in CI environments (like Vercel) that lack Chrome dependencies.');
    console.warn('Error detail:', err.message);
    console.warn('\nSkipping pre-rendering. The site will still work as a standard SPA.');
    console.warn('To get full SEO benefits, run "npm run build" locally and verify the "dist" folder.\n');
    server.close();
    return; // Exit gracefully
  }

  const page = await browser.newPage();
  
  for (const route of allRoutes) {
    console.log(`Prerendering ${route}...`);
    try {
      await page.goto(`http://localhost:8000${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 1000));
      const html = await page.content();
      
      let filePath = route === '/' ? path.join(distPath, 'index.html') : path.join(distPath, route, 'index.html');
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      fs.writeFileSync(filePath, html);
      console.log(`✅ Saved ${filePath}`);
    } catch (e) {
      console.error(`❌ Failed to prerender ${route}`, e.message);
    }
  }
  
  await browser.close();
  server.close();
  console.log('🎉 Prerendering complete!');
}

prerender();
