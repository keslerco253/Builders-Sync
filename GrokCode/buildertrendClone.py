import json
from datetime import datetime, date
import calendar  # New import for calendar functionality

class Project:
    def __init__(self, name, start_date, end_date, budget):
        self.name = name
        self.start_date = datetime.strptime(start_date, '%Y-%m-%d')
        self.end_date = datetime.strptime(end_date, '%Y-%m-%d')
        self.budget = float(budget)
        self.tasks = []  # List of Task objects
        self.expenses = 0.0
        self.client_updates = []  # List of strings for client communications

    def add_task(self, task):
        self.tasks.append(task)

    def add_expense(self, amount):
        self.expenses += float(amount)
        if self.expenses > self.budget:
            print(f"Warning: Project '{self.name}' is over budget by ${self.expenses - self.budget:.2f}")

    def send_client_update(self, message):
        self.client_updates.append(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {message}")
        print(f"Client update sent for '{self.name}': {message}")

    def get_status(self):
        completed_tasks = sum(1 for task in self.tasks if task.completed)
        total_tasks = len(self.tasks)
        progress = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        return {
            'name': self.name,
            'progress': f"{progress:.1f}%",
            'budget_used': f"${self.expenses:.2f} / ${self.budget:.2f}",
            'tasks_completed': f"{completed_tasks}/{total_tasks}"
        }

class Task:
    def __init__(self, description, due_date):
        self.description = description
        self.due_date = datetime.strptime(due_date, '%Y-%m-%d')
        self.completed = False

    def mark_complete(self):
        self.completed = True
        print(f"Task '{self.description}' marked as complete.")

class BuilderTrendLite:
    def __init__(self):
        self.projects = {}  # Dict of project_name: Project
        self.load_data()  # Load from file if exists

    def add_project(self, name, start_date, end_date, budget):
        if name in self.projects:
            print(f"Project '{name}' already exists.")
            return
        self.projects[name] = Project(name, start_date, end_date, budget)
        print(f"Project '{name}' added.")
        self.save_data()

    def add_task_to_project(self, project_name, description, due_date):
        if project_name not in self.projects:
            print(f"Project '{project_name}' not found.")
            return
        task = Task(description, due_date)
        self.projects[project_name].add_task(task)
        print(f"Task '{description}' added to '{project_name}'.")
        self.save_data()

    def add_expense_to_project(self, project_name, amount):
        if project_name not in self.projects:
            print(f"Project '{project_name}' not found.")
            return
        self.projects[project_name].add_expense(amount)
        self.save_data()

    def mark_task_complete(self, project_name, task_index):
        if project_name not in self.projects:
            print(f"Project '{project_name}' not found.")
            return
        if 0 <= task_index < len(self.projects[project_name].tasks):
            self.projects[project_name].tasks[task_index].mark_complete()
            self.save_data()
        else:
            print("Invalid task index.")

    def send_update_to_project(self, project_name, message):
        if project_name not in self.projects:
            print(f"Project '{project_name}' not found.")
            return
        self.projects[project_name].send_client_update(message)
        self.save_data()

    def view_project_status(self, project_name):
        if project_name not in self.projects:
            print(f"Project '{project_name}' not found.")
            return
        status = self.projects[project_name].get_status()
        print(f"Status for '{project_name}':")
        for key, value in status.items():
            print(f"  {key.capitalize()}: {value}")

    def list_projects(self):
        if not self.projects:
            print("No projects found.")
            return
        print("Current Projects:")
        for name in self.projects:
            print(f"- {name}")

    def save_data(self):
        data = {
            name: {
                'start_date': proj.start_date.strftime('%Y-%m-%d'),
                'end_date': proj.end_date.strftime('%Y-%m-%d'),
                'budget': proj.budget,
                'expenses': proj.expenses,
                'tasks': [
                    {
                        'description': task.description,
                        'due_date': task.due_date.strftime('%Y-%m-%d'),
                        'completed': task.completed
                    } for task in proj.tasks
                ],
                'client_updates': proj.client_updates
            } for name, proj in self.projects.items()
        }
        with open('projects.json', 'w') as f:
            json.dump(data, f)

    def load_data(self):
        try:
            with open('projects.json', 'r') as f:
                data = json.load(f)
            for name, proj_data in data.items():
                proj = Project(name, proj_data['start_date'], proj_data['end_date'], proj_data['budget'])
                proj.expenses = proj_data['expenses']
                for task_data in proj_data['tasks']:
                    task = Task(task_data['description'], task_data['due_date'])
                    task.completed = task_data['completed']
                    proj.tasks.append(task)
                proj.client_updates = proj_data['client_updates']
                self.projects[name] = proj
        except FileNotFoundError:
            pass

# New method: Get all upcoming deadlines (tasks not completed and due in future)
    def get_upcoming_deadlines(self):
        today = datetime.now().date()
        deadlines = []
        for proj_name, proj in self.projects.items():
            for task in proj.tasks:
                if not task.completed and task.due_date.date() >= today:
                    deadlines.append({
                        'project': proj_name,
                        'task': task.description,
                        'due_date': task.due_date.date()
                    })
        # Sort by due date
        deadlines.sort(key=lambda x: x['due_date'])
        return deadlines

    # New method: View calendar for a given month/year, marking deadlines
    def view_calendar(self, year=None, month=None):
        now = datetime.now()
        if year is None:
            year = now.year
        if month is None:
            month = now.month

        # Get all deadlines
        deadlines = self.get_upcoming_deadlines()

        # Filter deadlines for the specified month/year
        month_deadlines = {}
        for dl in deadlines:
            if dl['due_date'].year == year and dl['due_date'].month == month:
                day = dl['due_date'].day
                if day not in month_deadlines:
                    month_deadlines[day] = []
                month_deadlines[day].append(f"{dl['project']}: {dl['task']}")

        # Generate calendar
        cal = calendar.TextCalendar(calendar.SUNDAY)  # Start week on Sunday
        cal_str = cal.formatmonth(year, month)

        # Customize to mark dates (append * or something to dates with deadlines)
        lines = cal_str.split('\n')
        for i in range(2, len(lines)):  # Skip header lines
            if lines[i].strip():  # Week lines
                parts = lines[i].split()
                new_parts = []
                for part in parts:
                    if part.isdigit():
                        day = int(part)
                        marker = '*' if day in month_deadlines else ' '
                        new_parts.append(f"{part}{marker}")
                    else:
                        new_parts.append(part)
                lines[i] = ' '.join(new_parts).ljust(len(lines[i]))  # Preserve width

        # Print the calendar
        print('\n'.join(lines))

        # Print details for marked dates
        if month_deadlines:
            print("\nUpcoming Deadlines in this Month (* marked):")
            for day in sorted(month_deadlines):
                print(f"Day {day}:")
                for item in month_deadlines[day]:
                    print(f"  - {item}")
        else:
            print("\nNo upcoming deadlines in this month.")

# Updated CLI loop with new option
if __name__ == "__main__":
    app = BuilderTrendLite()
    while True:
        print("\nOptions:")
        print("1. Add Project")
        print("2. Add Task to Project")
        print("3. Add Expense to Project")
        print("4. Mark Task Complete")
        print("5. Send Client Update")
        print("6. View Project Status")
        print("7. List Projects")
        print("8. View Calendar")  # New option
        print("9. Exit")  # Incremented exit
        choice = input("Enter choice: ")
        
        if choice == '1':
            name = input("Project name: ")
            start = input("Start date (YYYY-MM-DD): ")
            end = input("End date (YYYY-MM-DD): ")
            budget = input("Budget: ")
            app.add_project(name, start, end, budget)
        elif choice == '2':
            proj = input("Project name: ")
            desc = input("Task description: ")
            due = input("Due date (YYYY-MM-DD): ")
            app.add_task_to_project(proj, desc, due)
        elif choice == '3':
            proj = input("Project name: ")
            amount = input("Expense amount: ")
            app.add_expense_to_project(proj, amount)
        elif choice == '4':
            proj = input("Project name: ")
            index = int(input("Task index (0-based): "))
            app.mark_task_complete(proj, index)
        elif choice == '5':
            proj = input("Project name: ")
            msg = input("Message: ")
            app.send_update_to_project(proj, msg)
        elif choice == '6':
            proj = input("Project name: ")
            app.view_project_status(proj)
        elif choice == '7':
            app.list_projects()
        elif choice == '8':
            year_input = input("Year (enter for current): ")
            month_input = input("Month (1-12, enter for current): ")
            year = int(year_input) if year_input else None
            month = int(month_input) if month_input else None
            app.view_calendar(year, month)
        elif choice == '9':
            break
        else:
            print("Invalid choice.")
