class TaskManager {
    constructor() {
        this.tasks = this.loadTasks();
        this.currentFilter = 'all';
        this.deferredPrompt = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.renderTasks();
        this.setupPWA();
        this.setupNotifications();
        this.checkScheduledTasks();
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
                .then(registration => console.log('SW registered'))
                .catch(error => console.log('SW registration failed'));
        }
    }

    setupNotifications() {
        if ('Notification' in window && 'serviceWorker' in navigator) {
            Notification.requestPermission();
        }
    }

    async showNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const registration = await navigator.serviceWorker.ready;
            registration.showNotification(title, {
                body: body,
                icon: '/',
                badge: '/'
            });
        }
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
            notified: false
        };

        this.tasks.push(task);
        this.saveTasks();
        this.renderTasks();
        this.scheduleNotification(task);

        this.taskInput.value = '';
        this.taskDateTime.value = '';
        this.taskInput.focus();
    }

    scheduleNotification(task) {
        if (!task.dueDate) return;

        const dueDate = new Date(task.dueDate);
        const now = new Date();

        if (dueDate > now) {
            const timeout = dueDate.getTime() - now.getTime();
            
            setTimeout(() => {
                this.showNotification('📅 Tarea pendiente', `"${task.text}" está programada para ahora`);
                task.notified = true;
                this.saveTasks();
            }, timeout);
        }
    }

    checkScheduledTasks() {
        const now = new Date();
        
        this.tasks.forEach(task => {
            if (task.dueDate && !task.completed && !task.notified) {
                const dueDate = new Date(task.dueDate);
                if (dueDate <= now) {
                    this.showNotification('⏰ Tarea vencida', `"${task.text}" debería haberse completado`);
                    task.notified = true;
                } else {
                    this.scheduleNotification(task);
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
                        `<div class="task-date">📅 ${this.formatDate(task.dueDate)}</div>` : 
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
setInterval(() => taskManager.checkScheduledTasks(), 60000);