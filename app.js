class TaskManager {
    constructor() {
        this.tasks = this.loadTasks();
        this.currentFilter = 'all';
        this.deferredPrompt = null;
        this.serviceWorker = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.renderTasks();
        this.initializeApp();
        
        // Verificar tareas programadas
        this.checkScheduledTasks();
        setInterval(() => this.checkScheduledTasks(), 30000); // Cada 30 segundos
    }

    async initializeApp() {
        await this.setupPWA();
        await this.setupNotifications();
        this.restoreScheduledNotifications();
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

        // Guardar tareas cuando se cierra la pestaña
        window.addEventListener('beforeunload', () => {
            this.saveTasks();
        });

        // Recuperar notificaciones cuando se vuelve a abrir
        window.addEventListener('load', () => {
            this.restoreScheduledNotifications();
        });
    }

    async setupPWA() {
        if ('serviceWorker' in navigator) {
            try {
                this.serviceWorker = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registrado:', this.serviceWorker);
                
                // Esperar a que el Service Worker esté activo
                if (this.serviceWorker.installing) {
                    console.log('Service Worker instalando');
                    this.serviceWorker.installing.postMessage({ type: 'SKIP_WAITING' });
                }
                
                return this.serviceWorker;
            } catch (error) {
                console.log('Error registrando Service Worker:', error);
            }
        }
        return null;
    }

    async setupNotifications() {
        if (!('Notification' in window)) {
            console.log('Este navegador no soporta notificaciones');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            console.log('Permiso de notificaciones:', permission);
            
            if (permission === 'granted') {
                // Guardar en localStorage que las notificaciones están activas
                localStorage.setItem('notificationsEnabled', 'true');
                return true;
            } else {
                localStorage.setItem('notificationsEnabled', 'false');
                return false;
            }
        } catch (error) {
            console.log('Error solicitando permiso:', error);
            return false;
        }
    }

    areNotificationsEnabled() {
        return localStorage.getItem('notificationsEnabled') === 'true';
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
            notificationId: `task-${Date.now()}`
        };

        this.tasks.push(task);
        this.saveTasks();
        this.renderTasks();
        
        // Programar notificaciones si tiene fecha
        if (task.dueDate) {
            this.scheduleTaskNotifications(task);
        }

        this.taskInput.value = '';
        this.taskDateTime.value = '';
        this.taskInput.focus();

        // Mostrar confirmación
        this.showLocalNotification('✅ Tarea Agregada', `"${text}" fue agregada correctamente`);
    }

    scheduleTaskNotifications(task) {
        if (!task.dueDate || task.completed) return;

        const dueDate = new Date(task.dueDate);
        const now = new Date();

        console.log('Programando notificaciones para:', task.text, 'en', dueDate);

        // Notificación 1 hora antes
        const oneHourBefore = new Date(dueDate.getTime() - 60 * 60 * 1000);
        if (oneHourBefore > now) {
            const timeout = oneHourBefore.getTime() - now.getTime();
            console.log('Notificación 1h antes en:', timeout, 'ms');
            
            setTimeout(() => {
                if (!task.completed && !task.notified) {
                    this.showLocalNotification('🔔 Recordatorio', `"${task.text}" vence en 1 hora`);
                }
            }, timeout);
        }

        // Notificación 15 minutos antes
        const fifteenMinBefore = new Date(dueDate.getTime() - 15 * 60 * 1000);
        if (fifteenMinBefore > now) {
            const timeout = fifteenMinBefore.getTime() - now.getTime();
            console.log('Notificación 15min antes en:', timeout, 'ms');
            
            setTimeout(() => {
                if (!task.completed && !task.notified) {
                    this.showLocalNotification('⏰ Tarea Próxima', `"${task.text}" vence en 15 minutos`);
                }
            }, timeout);
        }

        // Notificación en el momento exacto
        if (dueDate > now) {
            const timeout = dueDate.getTime() - now.getTime();
            console.log('Notificación exacta en:', timeout, 'ms');
            
            const timeoutId = setTimeout(() => {
                if (!task.completed && !task.notified) {
                    this.showLocalNotification('📅 Tarea Pendiente', `"${task.text}" vence ahora`);
                    task.notified = true;
                    this.saveTasks();
                }
            }, timeout);

            // Guardar el timeout ID para poder cancelarlo si es necesario
            task.timeoutId = timeoutId;
        }

        this.saveTasks();
    }

    async showLocalNotification(title, body) {
        if (!this.areNotificationsEnabled()) {
            console.log('Notificaciones no permitidas');
            return;
        }

        try {
            // Usar notificaciones del Service Worker si está disponible
            if (this.serviceWorker && this.serviceWorker.active) {
                this.serviceWorker.active.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: title,
                    body: body
                });
            } else {
                // Fallback a notificaciones normales
                const notification = new Notification(title, {
                    body: body,
                    icon: '/',
                    badge: '/',
                    tag: 'task-reminder',
                    requireInteraction: true
                });

                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };
            }
            
            console.log('Notificación mostrada:', title, body);
        } catch (error) {
            console.log('Error mostrando notificación:', error);
        }
    }

    restoreScheduledNotifications() {
        console.log('Restaurando notificaciones programadas...');
        const now = new Date();
        
        this.tasks.forEach(task => {
            if (task.dueDate && !task.completed && !task.notified) {
                const dueDate = new Date(task.dueDate);
                
                // Si la tarea aún no ha vencido, reprogramar notificaciones
                if (dueDate > now) {
                    console.log('Reprogramando notificaciones para:', task.text);
                    this.scheduleTaskNotifications(task);
                } else {
                    // Si ya venció, marcar como notificada
                    task.notified = true;
                }
            }
        });
        
        this.saveTasks();
    }

    checkScheduledTasks() {
        const now = new Date();
        let needsSave = false;
        
        this.tasks.forEach(task => {
            if (task.dueDate && !task.completed && !task.notified) {
                const dueDate = new Date(task.dueDate);
                
                // Si la tarea ya venció y no fue notificada
                if (dueDate <= now) {
                    this.showLocalNotification('🚨 Tarea Vencida', `"${task.text}" está vencida`);
                    task.notified = true;
                    needsSave = true;
                }
            }
        });
        
        if (needsSave) {
            this.saveTasks();
        }
    }

    toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            
            // Si se completa, cancelar notificaciones futuras
            if (task.completed && task.timeoutId) {
                clearTimeout(task.timeoutId);
            }
            
            this.saveTasks();
            this.renderTasks();
        }
    }

    deleteTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task && task.timeoutId) {
            clearTimeout(task.timeoutId);
        }
        
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.saveTasks();
        this.renderTasks();
    }

    clearCompleted() {
        this.tasks.forEach(task => {
            if (task.completed && task.timeoutId) {
                clearTimeout(task.timeoutId);
            }
        });
        
        this.tasks = this.tasks.filter(t => !t.completed);
        this.saveTasks();
        this.renderTasks();
        
        this.showLocalNotification('🧹 Limpieza', 'Tareas completadas eliminadas');
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
                        `<div class="task-date">📅 ${this.formatDate(task.dueDate)} ${this.isOverdue(task) && !task.completed ? '⏰ VENCIDA' : ''}</div>` : 
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
        const overdue = this.tasks.filter(t => this.isOverdue(t) && !t.completed).length;

        this.taskCount.textContent = `Total: ${total} | Pendientes: ${pending} | Completadas: ${completed} ${overdue > 0 ? `| Vencidas: ${overdue}` : ''}`;
    }

    saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
        // También guardar el estado de las notificaciones
        localStorage.setItem('lastSave', new Date().toISOString());
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
                this.showLocalNotification('🎉 App Instalada', '¡Ahora puedes usar la app sin navegador!');
            }
            
            this.deferredPrompt = null;
        }
    }
}

// Inicializar la app cuando se carga la página
let taskManager;
document.addEventListener('DOMContentLoaded', () => {
    taskManager = new TaskManager();
});