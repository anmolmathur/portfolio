// Smooth Scrolling for Navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    });
});

// Scroll Animation for About Me Section
document.addEventListener('DOMContentLoaded', () => {
    const aboutCard = document.querySelector('.about-card');

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    aboutCard.classList.add('visible');
                }
            });
        },
        { threshold: 0.1 }
    );

    observer.observe(aboutCard);
});

// Scroll Animation for Work Experience Cards
document.addEventListener('DOMContentLoaded', () => {
    const workCards = document.querySelectorAll('.timeline-item .card');

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        },
        { threshold: 0.1 }
    );

    workCards.forEach((card) => observer.observe(card));
});

// Scroll Animation for Work Experience Timeline
document.addEventListener('DOMContentLoaded', () => {
    const timelineItems = document.querySelectorAll('.content');

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        },
        { threshold: 0.2 }
    );

    timelineItems.forEach((item) => observer.observe(item));
});

// Enable collapsible functionality only for mobile devices
if (window.matchMedia("(max-width: 768px)").matches) {
  document.querySelectorAll('.collapsible-section').forEach(section => {
    const header = section.querySelector('.section-header');
    const content = section.querySelector('.section-content');
    const button = section.querySelector('.toggle-btn');

    header.addEventListener('click', () => {
      // Toggle expanded class
      content.classList.toggle('expanded');

      // Update the button text
      button.textContent = content.classList.contains('expanded') ? '−' : '+';
    });
  });
}

