class TaskManager {
    constructor() {
        this.tasks = this.loadTasks();
        this.currentFilter = 'all';
        this.deferredPrompt = null;
        this.pushSubscription = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.renderTasks();
        this.setupPWA();
        this.setupPushNotifications();
        this.checkScheduledTasks();
        
        // Verificar tareas cada minuto
        setInterval(() => this.checkScheduledTasks(), 60000);
    }

    initializeElements() {
        this.taskInput = document.getElementById('taskInput');
        this.taskDateTime = document.getElementById('taskDateTime');
        this.addBtn = document.getElementById('addBtn');
        this.taskList = document.getElementById('taskList');
        this.taskCount = document.getElementById('taskCount');
        this.clearCompletedBtn = document.getElementById('clearCompleted');
        this.installBtn = document.getElementById('installBtn');
        this.filterBtns = document.querySelectorAll('.filter-btn');
    }

    setupEventListeners() {
        this.addBtn.addEventListener('click', () => this.addTask());
        this.taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTask();
        });
        
        this.clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
        
        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.renderTasks();
            });
        });

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.installBtn.style.display = 'block';
        });

        this.installBtn.addEventListener('click', () => this.installPWA());
    }

    setupPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('SW registered:', registration);
                    return registration;
                })
                .catch(error => console.log('SW registration failed:', error));
        }
    }

    async setupPushNotifications() {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.log('Push notifications no soportadas');
            return;
        }

        try {
            // Solicitar permiso para notificaciones
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log('Permiso de notificaciones denegado');
                return;
            }

            // Registrar service worker
            const registration = await navigator.serviceWorker.ready;
            
            // Suscribirse a push notifications
            this.pushSubscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(this.getPublicKey())
            });

            console.log('Suscripción push exitosa:', this.pushSubscription);
            this.saveSubscription(this.pushSubscription);
            
        } catch (error) {
            console.log('Error en push notifications:', error);
        }
    }

    // Clave pública VAPID (necesaria para push notifications)
    getPublicKey() {
        return 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    saveSubscription(subscription) {
        localStorage.setItem('pushSubscription', JSON.stringify(subscription));
    }

    getSubscription() {
        const saved = localStorage.getItem('pushSubscription');
        return saved ? JSON.parse(saved) : null;
    }

    async sendPushNotification(task, type = 'reminder') {
        const subscription = this.getSubscription();
        if (!subscription) {
            console.log('No hay suscripción push activa');
            return;
        }

        // En una app real, aquí enviarías la notificación a un servidor
        // Para esta demo, usaremos notificaciones locales programadas
        
        if (type === 'reminder') {
            this.scheduleLocalNotification(task);
        } else if (type === 'overdue') {
            this.showLocalNotification('⏰ Tarea Vencida', `"${task.text}" está vencida`);
        }
    }

    scheduleLocalNotification(task) {
        if (!task.dueDate) return;

        const dueDate = new Date(task.dueDate);
        const now = new Date();
        
        // Notificar 5 minutos antes
        const notifyTime = new Date(dueDate.getTime() - 5 * 60 * 1000);
        
        if (notifyTime > now) {
            const timeout = notifyTime.getTime() - now.getTime();
            
            setTimeout(() => {
                if (!task.completed) {
                    this.showLocalNotification('📅 Recordatorio', `"${task.text}" vence en 5 minutos`);
                    task.notified = true;
                    this.saveTasks();
                }
            }, timeout);
        }
    }

    async showLocalNotification(title, body) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        
        registration.showNotification(title, {
            body: body,
            icon: '/',
            badge: '/',
            vibrate: [200, 100, 200],
            tag: 'task-reminder',
            renotify: true,
            actions: [
                {
                    action: 'open',
                    title: 'Abrir App'
                }
            ]
        });
    }

    addTask() {
        const text = this.taskInput.value.trim();
        const dateTime = this.taskDateTime.value;

        if (!text) {
            alert('Por favor ingresa una tarea');
            return;
        }

        const task = {
            id: Date.now(),
            text: text,
            completed: false,
            createdAt: new Date().toISOString(),
            dueDate: dateTime || null,
            notified: false,
            notificationScheduled: false
        };

        this.tasks.push(task);
        this.saveTasks();
        this.renderTasks();
        
        // Programar notificaciones para la nueva tarea
        if (task.dueDate) {
            this.scheduleTaskNotifications(task);
        }

        this.taskInput.value = '';
        this.taskDateTime.value = '';
        this.taskInput.focus();
    }

    scheduleTaskNotifications(task) {
        if (!task.dueDate || task.completed) return;

        const dueDate = new Date(task.dueDate);
        const now = new Date();

        // Notificación 1 hora antes
        const oneHourBefore = new Date(dueDate.getTime() - 60 * 60 * 1000);
        if (oneHourBefore > now) {
            const timeout = oneHourBefore.getTime() - now.getTime();
            setTimeout(() => {
                if (!task.completed) {
                    this.showLocalNotification('🔔 Tarea Próxima', `"${task.text}" vence en 1 hora`);
                }
            }, timeout);
        }

        // Notificación 5 minutos antes (ya programada arriba)
        this.scheduleLocalNotification(task);

        // Notificación en el momento exacto
        if (dueDate > now) {
            const timeout = dueDate.getTime() - now.getTime();
            setTimeout(() => {
                if (!task.completed) {
                    this.showLocalNotification('📅 Tarea Pendiente', `"${task.text}" vence ahora`);
                    task.notified = true;
                    this.saveTasks();
                }
            }, timeout);
        }
    }

    checkScheduledTasks() {
        const now = new Date();
        
        this.tasks.forEach(task => {
            if (task.dueDate && !task.completed && !task.notified) {
                const dueDate = new Date(task.dueDate);
                
                // Si la tarea ya venció
                if (dueDate <= now) {
                    this.showLocalNotification('⏰ Tarea Vencida', `"${task.text}" está vencida`);
                    task.notified = true;
                } 
                // Si falta menos de 1 hora
                else if ((dueDate.getTime() - now.getTime()) <= 60 * 60 * 1000 && !task.notificationScheduled) {
                    this.showLocalNotification('🔔 Tarea Próxima', `"${task.text}" vence en menos de 1 hora`);
                    task.notificationScheduled = true;
                }
            }
        });
        
        this.saveTasks();
    }

    toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            this.saveTasks();
            this.renderTasks();
        }
    }

    deleteTask(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.saveTasks();
        this.renderTasks();
    }

    clearCompleted() {
        this.tasks = this.tasks.filter(t => !t.completed);
        this.saveTasks();
        this.renderTasks();
    }

    renderTasks() {
        this.taskList.innerHTML = '';

        const filteredTasks = this.tasks.filter(task => {
            switch (this.currentFilter) {
                case 'pending': return !task.completed;
                case 'completed': return task.completed;
                default: return true;
            }
        });

        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''} ${this.isOverdue(task) ? 'overdue' : ''}`;
            
            li.innerHTML = `
                <input type="checkbox" ${task.completed ? 'checked' : ''} 
                    onchange="taskManager.toggleTask(${task.id})">
                <div class="task-content">
                    <div class="task-text">${task.text}</div>
                    ${task.dueDate ? 
                        `<div class="task-date">📅 ${this.formatDate(task.dueDate)} ${this.isOverdue(task) ? '⏰ VENCIDA' : ''}</div>` : 
                        ''
                    }
                </div>
                <div class="task-actions">
                    <button class="complete-btn" onclick="taskManager.toggleTask(${task.id})">
                        ${task.completed ? '↶' : '✓'}
                    </button>
                    <button class="delete-btn" onclick="taskManager.deleteTask(${task.id})">
                        🗑️
                    </button>
                </div>
            `;

            this.taskList.appendChild(li);
        });

        this.updateStats();
    }

    isOverdue(task) {
        if (task.completed || !task.dueDate) return false;
        return new Date(task.dueDate) < new Date();
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString('es-ES');
    }

    updateStats() {
        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.completed).length;
        const pending = total - completed;

        this.taskCount.textContent = `Total: ${total} | Pendientes: ${pending} | Completadas: ${completed}`;
    }

    saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
    }

    loadTasks() {
        const saved = localStorage.getItem('tasks');
        return saved ? JSON.parse(saved) : [];
    }

    async installPWA() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                this.installBtn.style.display = 'none';
            }
            
            this.deferredPrompt = null;
        }
    }
}

const taskManager = new TaskManager();