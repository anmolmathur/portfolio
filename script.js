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





// Add event listener to toggle button
document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.querySelector("#collapsible-section.contact .toggle-btn");
    const contactContainer = document.querySelector("#collapsible-section.contact .contact-container");

    toggleBtn.addEventListener("click", () => {
        // Toggle expanded class
        contactContainer.classList.toggle("expanded");

        // Change button text between "+" and "-"
        toggleBtn.textContent = contactContainer.classList.contains("expanded") ? "-" : "+";
    });
});


