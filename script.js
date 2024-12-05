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

// For Read More Section to work

document.addEventListener("DOMContentLoaded", function () {
    // Add toggle functionality to buttons
    document.querySelectorAll(".toggle-btn").forEach((button) => {
        button.addEventListener("click", function () {
            const targetId = button.getAttribute("data-toggle");
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                // Toggle visibility of the details section
                if (targetElement.classList.contains("hidden")) {
                    targetElement.classList.remove("hidden");
                    button.textContent = "Read Less"; // Change to minus when expanded
                } else {
                    targetElement.classList.add("hidden");
                    button.textContent = "Read More"; // Change to plus when collapsed
                }
            }
        });
    });
});

