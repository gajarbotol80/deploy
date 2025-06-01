// public/js/main.js
// General client-side JavaScript for NodeDeploy Pro v3

document.addEventListener('DOMContentLoaded', () => {
    console.log("NodeDeploy Pro v3 UI Initialized");

    // Smooth scroll for anchor links, if any are added later
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const hrefAttr = this.getAttribute('href');
            if (hrefAttr && hrefAttr.length > 1) { // Ensure it's not just "#"
                const targetElement = document.querySelector(hrefAttr);
                if (targetElement) {
                    e.preventDefault();
                    targetElement.scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // Example: Add loading state to forms on submit
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                // Prevent double submission
                if (submitButton.classList.contains('btn-loading')) {
                    e.preventDefault();
                    return;
                }
                submitButton.classList.add('btn-loading');
                submitButton.disabled = true; 
                // You might want to remove btn-loading after a timeout or on page load if submission fails client-side
                // For server-side redirects, this will reset automatically.
            }
        });
    });

    // Auto-dismiss alert messages after a few seconds
    const alerts = document.querySelectorAll('.alert-message');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.transition = 'opacity 0.5s ease';
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 500);
        }, 5000); // 5 seconds
    });

});
