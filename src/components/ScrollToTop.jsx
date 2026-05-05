import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Adding a slight delay or forcing instant scroll can help override smooth scrolling issues
    document.documentElement.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant', // Use instant to avoid weird smooth scrolling transitions on page load
    });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
