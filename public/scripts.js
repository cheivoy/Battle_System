function showNotification(message, type) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.remove('hidden', 'notification-success', 'notification-error');
    notification.classList.add(`notification-${type}`);
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.classList.toggle('hidden', !show);
}