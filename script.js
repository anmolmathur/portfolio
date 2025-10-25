// Smooth Scrolling
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }
  
  // Auto-scroll to URL hash on load
  function autoScrollToHash() {
    const hash = window.location.hash;
    if (hash) {
      const target = document.querySelector(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }
  
  // Intersection Observer for visible classes
  function initSectionAnimation() {
    const targets = document.querySelectorAll('.about-card, .timeline-item, .skill-card, .project-card, .education-card, .article-card');
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.3 }
    );
    targets.forEach(target => observer.observe(target));
  }
  
  // Toggle visibility of content sections on mobile
  function handleSectionVisibility() {
    const isMobile = window.innerWidth <= 768;
    document.querySelectorAll('.section-content').forEach((content) => {
      const section = content.closest('section');
      const button = section.querySelector('.toggle-btn');
      const sectionId = section?.id || '';
  
      const shouldCollapse = ['education', 'projects', 'publications', 'contact', 'articles'].includes(sectionId);
  
      if (isMobile) {
        if (shouldCollapse) {
          content.classList.add('collapsed');
          if (button) button.textContent = 'Read More';
        } else {
          content.classList.remove('collapsed');
          if (button) button.textContent = '';
        }
      } else {
        content.classList.remove('collapsed');
        if (button) button.textContent = '';
      }
    });
  }
  
  // Toggle Button Logic
  function initToggleButtons() {
    document.querySelectorAll('.toggle-btn').forEach((button) => {
      const section = button.closest('section');
      const content = section.querySelector('.section-content');
      button.addEventListener('click', () => {
        const isCollapsed = content.classList.contains('collapsed');
        content.classList.toggle('collapsed');
        button.textContent = isCollapsed ? 'Read Less' : 'Read More';
      });
    });
  }
  
  // Disable flip on mobile
  function initFlipCards() {
    const flipCards = document.querySelectorAll('.flip-card');
    flipCards.forEach((card) => {
      card.addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          this.classList.toggle('touch-flip');
        }
      });
    });
  }

  // Master Init
  document.addEventListener('DOMContentLoaded', () => {
    initSmoothScroll();
    autoScrollToHash();
    initSectionAnimation();
    initWorkExperienceAnimation(); // 🧠 NEW — for work cards
    initToggleButtons();
    initFlipCards();
    handleSectionVisibility();

    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
  
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('show');
    });

    window.addEventListener('resize', handleSectionVisibility);
  });


  function initWorkExperienceAnimation() {
    const items = document.querySelectorAll('#work-experience .timeline-item');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const contents = entry.target.querySelectorAll('.content');
          contents.forEach(el => el.classList.add('visible'));
        }
      });
    }, { threshold: 0.2 });
  
    items.forEach(item => observer.observe(item));
  }