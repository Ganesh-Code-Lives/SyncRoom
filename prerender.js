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
  const distPath = path.resolve(__dirname, 'dist');
  
  if (!fs.existsSync(distPath)) {
    console.error('dist directory does not exist. Run npm run build first.');
    process.exit(1);
  }

  // Serve the built app locally
  const app = express();
  app.use(express.static(distPath));
  // Fallback to index.html for SPA routing
  app.use((req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
  
  const server = app.listen(8000, () => {
    console.log('Local server running on port 8000 for prerendering');
  });
  
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Wait until the React app says it's hydrated/rendered or just wait for network idle
  // networkidle0 is perfect for SPAs doing fetch
  for (const route of allRoutes) {
    console.log(`Prerendering ${route}...`);
    try {
      await page.goto(`http://localhost:8000${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
      
      // Wait an extra second just to be absolutely sure React has painted everything
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const html = await page.content();
      
      // Calculate output path
      let filePath;
      if (route === '/') {
        filePath = path.join(distPath, 'index.html');
      } else {
        filePath = path.join(distPath, route, 'index.html');
      }
      
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, html);
      console.log(`✅ Saved ${filePath}`);
    } catch (e) {
      console.error(`❌ Failed to prerender ${route}`, e);
    }
  }
  
  await browser.close();
  server.close();
  console.log('🎉 Prerendering complete!');
}

prerender();
