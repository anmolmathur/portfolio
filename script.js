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

// Function to handle the visibility of sections based on screen size
function handleSectionVisibility() {
    const isMobile = window.innerWidth <= 512; // Define mobile breakpoint

    document.querySelectorAll('.section-content').forEach((content) => {
        if (isMobile) {
            // Collapse sections on mobile by default
            content.style.display = 'none';
            const button = content.closest('section').querySelector('.toggle-btn');
            if (button) button.textContent = 'Read More';
        } else {
            // Expand sections on desktop by default
            content.style.display = 'block';
            const button = content.closest('section').querySelector('.toggle-btn');
            if (button) button.textContent = '';
        }
    });
}

// Run visibility handler on page load
handleSectionVisibility();

// Update visibility on window resize
window.addEventListener('resize', handleSectionVisibility);

// Toggle functionality for the button
document.querySelectorAll('.toggle-btn').forEach((button) => {
    button.addEventListener('click', function () {
        const content = this.closest('section').querySelector('.section-content');

        if (!content) return;

        // Toggle visibility
        const isCollapsed = content.style.display === 'none' || content.style.display === '';

        if (isCollapsed) {
            content.style.display = 'block';
            this.textContent = 'Read Less';
        } else {
            content.style.display = 'none';
            this.textContent = 'Read More';
        }
    });
});
