console.log("JavaScript is working!");
// Smooth scrolling for navigation links
document.querySelectorAll('header nav a').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        document.getElementById(targetId).scrollIntoView({ behavior: 'smooth' });
    });
});

// Scroll animations for sections
const sections = document.querySelectorAll('.section');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, { threshold: 0.2 });

sections.forEach(section => {
    section.classList.add('hidden'); // Initially hidden
    observer.observe(section);
});


// Parallax Effect for Hero Section
window.addEventListener('scroll', function () {
    const hero = document.querySelector('.hero');
    let scrollPosition = window.scrollY;
    hero.style.backgroundPositionY = `${scrollPosition * 0.5}px`;
});
