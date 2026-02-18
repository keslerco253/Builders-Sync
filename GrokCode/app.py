from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import json
import os, uuid, base64

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:auth_socket@localhost/liberty_homes'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


# ============================================================
# MODELS
# ============================================================

class LoginInfo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), unique=True, nullable=False)
    firstName = db.Column(db.String(30), nullable=False)
    lastName = db.Column(db.String(30), nullable=False)
    companyName = db.Column(db.String(120), nullable=False, default='')
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='builder')  # builder | contractor | customer
    phone = db.Column(db.String(30), default='')
    trades = db.Column(db.String(255), default='')
    street_address = db.Column(db.String(200), default='')
    city = db.Column(db.String(100), default='')
    state = db.Column(db.String(2), default='')
    zip_code = db.Column(db.String(10), default='')
    active = db.Column(db.Boolean, default=True)
    theme_preference = db.Column(db.String(10), default='system')  # 'system' | 'dark' | 'light'
    company_logo = db.Column(db.Text, default='')  # base64 image data
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, username, password, firstName, lastName, companyName='',
                 role='builder', phone='', trades='', street_address='', city='', state='', zip_code=''):
        self.username = username
        self.password = generate_password_hash(password)
        self.firstName = firstName
        self.lastName = lastName
        self.companyName = companyName
        self.role = role
        self.phone = phone
        self.trades = trades
        self.street_address = street_address
        self.city = city
        self.state = state
        self.zip_code = zip_code

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'first_name': self.firstName,
            'last_name': self.lastName,
            'name': f'{self.firstName} {self.lastName}',
            'company_name': self.companyName,
            'role': self.role,
            'phone': self.phone,
            'trades': self.trades,
            'street_address': self.street_address or '',
            'city': self.city or '',
            'state': self.state or '',
            'zip_code': self.zip_code or '',
            'active': self.active,
            'theme_preference': self.theme_preference or 'system',
            'has_logo': bool(self.company_logo),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Subdivision(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'name': self.name}


class Projects(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    number = db.Column(db.String(20))
    address = db.Column(db.String(255), default='')
    street_address = db.Column(db.String(200), default='')
    city = db.Column(db.String(100), default='')
    state = db.Column(db.String(2), default='')
    zip_code = db.Column(db.String(10), default='')
    status = db.Column(db.String(50), default='Pre-Construction')
    phase = db.Column(db.String(50), default='Planning')
    customer_id = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=True)
    start_date = db.Column(db.String(20), default='')
    est_completion = db.Column(db.String(20), default='')
    progress = db.Column(db.Integer, default=0)
    original_price = db.Column(db.Float, default=0)
    contract_price = db.Column(db.Float, default=0)
    sqft = db.Column(db.Integer, default=0)
    bedrooms = db.Column(db.Integer, default=0)
    bathrooms = db.Column(db.Integer, default=0)
    garage = db.Column(db.String(50), default='')
    lot_size = db.Column(db.String(50), default='')
    style = db.Column(db.String(50), default='')
    stories = db.Column(db.Integer, default=1)
    email = db.Column(db.String(120), default='')
    reconciliation = db.Column(db.Float, default=0)
    dates_from_schedule = db.Column(db.Boolean, default=False)
    go_live = db.Column(db.Boolean, default=False)
    on_hold = db.Column(db.Boolean, default=False)
    hold_start_date = db.Column(db.String(20), default='')
    subdivision_id = db.Column(db.Integer, db.ForeignKey('subdivision.id'), nullable=True)
    date = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'number': self.number,
            'address': self.address,
            'street_address': self.street_address or '',
            'city': self.city or '',
            'state': self.state or '',
            'zip_code': self.zip_code or '',
            'status': self.status,
            'phase': self.phase,
            'customer_id': self.customer_id,
            'start_date': self.start_date,
            'est_completion': self.est_completion,
            'progress': self.progress,
            'original_price': self.original_price,
            'contract_price': self.contract_price,
            'sqft': self.sqft,
            'bedrooms': self.bedrooms,
            'bathrooms': self.bathrooms,
            'garage': self.garage,
            'lot_size': self.lot_size,
            'style': self.style,
            'stories': self.stories,
            'email': self.email,
            'reconciliation': self.reconciliation or 0,
            'dates_from_schedule': self.dates_from_schedule or False,
            'go_live': bool(self.go_live) if self.go_live else False,
            'on_hold': bool(self.on_hold) if self.on_hold else False,
            'hold_start_date': self.hold_start_date or '',
            'subdivision_id': self.subdivision_id,
            'date': self.date.isoformat() if self.date else None,
        }


class JobUsers(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=False)
    role = db.Column(db.String(20), default='contractor')

    def to_dict(self):
        return {'id': self.id, 'job_id': self.job_id, 'user_id': self.user_id, 'role': self.role}


class ChangeOrders(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    amount = db.Column(db.Float, default=0)
    status = db.Column(db.String(30), default='pending_customer')
    builder_sig = db.Column(db.Boolean, default=False)
    builder_sig_date = db.Column(db.String(20), nullable=True)
    customer_sig = db.Column(db.Boolean, default=False)
    customer_sig_date = db.Column(db.String(20), nullable=True)
    created_at = db.Column(db.String(20), default='')

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id, 'title': self.title,
            'description': self.description, 'amount': self.amount,
            'status': self.status, 'builder_sig': self.builder_sig,
            'builder_sig_date': self.builder_sig_date, 'customer_sig': self.customer_sig,
            'customer_sig_date': self.customer_sig_date, 'created_at': self.created_at,
        }


class SelectionItem(db.Model):
    """Global selection catalog - not tied to any project"""
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(100), default='')
    item = db.Column(db.String(200), default='')
    options = db.Column(db.Text, default='[]')  # JSON: [{name, image_path, price, comes_standard}]

    def to_dict(self):
        return {
            'id': self.id, 'category': self.category, 'item': self.item,
            'options': json.loads(self.options) if self.options else [],
        }


class ProjectSelection(db.Model):
    """Per-project selection choice made by customer"""
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    selection_item_id = db.Column(db.Integer, db.ForeignKey('selection_item.id'), nullable=False)
    selected = db.Column(db.String(200), nullable=True)
    status = db.Column(db.String(30), default='pending')  # pending | confirmed

    def to_dict(self):
        item = SelectionItem.query.get(self.selection_item_id)
        d = item.to_dict() if item else {'id': self.selection_item_id, 'category': '', 'item': '', 'options': []}
        d['project_selection_id'] = self.id
        d['job_id'] = self.job_id
        d['selected'] = self.selected
        d['status'] = self.status
        d['selection_item_id'] = self.selection_item_id
        return d


class Schedule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    task = db.Column(db.String(200), default='')
    start_date = db.Column(db.String(20), default='')
    end_date = db.Column(db.String(20), default='')
    baseline_start = db.Column(db.String(20), default='')
    baseline_end = db.Column(db.String(20), default='')
    progress = db.Column(db.Integer, default=0)
    contractor = db.Column(db.String(100), default='')
    trade = db.Column(db.String(100), default='')
    predecessor_id = db.Column(db.Integer, nullable=True)
    rel_type = db.Column(db.String(5), default='FS')
    lag_days = db.Column(db.Integer, default=0)
    is_exception = db.Column(db.Boolean, default=False)
    exception_description = db.Column(db.Text, default='')

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id, 'task': self.task,
            'start_date': self.start_date, 'end_date': self.end_date,
            'baseline_start': self.baseline_start, 'baseline_end': self.baseline_end,
            'progress': self.progress, 'contractor': self.contractor,
            'trade': self.trade or '',
            'predecessor_id': self.predecessor_id, 'rel_type': self.rel_type,
            'lag_days': self.lag_days,
            'is_exception': bool(self.is_exception) if self.is_exception else False,
            'exception_description': self.exception_description or '',
        }


class ScheduleEditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    schedule_id = db.Column(db.Integer, db.ForeignKey('schedule.id'), nullable=False)
    job_id = db.Column(db.Integer, nullable=False)
    task_name = db.Column(db.String(200), default='')
    field_changed = db.Column(db.String(50), default='')
    old_value = db.Column(db.String(200), default='')
    new_value = db.Column(db.String(200), default='')
    reason = db.Column(db.Text, default='')
    edited_by = db.Column(db.String(100), default='')
    edited_at = db.Column(db.String(30), default='')

    def to_dict(self):
        return {
            'id': self.id, 'schedule_id': self.schedule_id, 'job_id': self.job_id,
            'task_name': self.task_name, 'field_changed': self.field_changed,
            'old_value': self.old_value, 'new_value': self.new_value,
            'reason': self.reason, 'edited_by': self.edited_by, 'edited_at': self.edited_at,
        }


class WorkdayExemption(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=True)  # NULL = global
    date = db.Column(db.String(10), nullable=False)  # YYYY-MM-DD
    description = db.Column(db.String(200), default='')
    recurring = db.Column(db.Boolean, default=False)  # True = repeats annually (month-day only)
    created_by = db.Column(db.String(100), default='')

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id,
            'date': self.date, 'description': self.description,
            'recurring': self.recurring, 'created_by': self.created_by,
        }


class Employee(db.Model):
    """Employees belonging to a subcontractor company."""
    id = db.Column(db.Integer, primary_key=True)
    sub_id = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=False)
    name = db.Column(db.String(200), default='')
    job_description = db.Column(db.String(300), default='')
    phone = db.Column(db.String(20), default='')

    def to_dict(self):
        return {
            'id': self.id, 'sub_id': self.sub_id,
            'name': self.name, 'job_description': self.job_description,
            'phone': self.phone,
        }


class ScheduleTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), default='')
    icon = db.Column(db.String(10), default='📋')
    description = db.Column(db.String(500), default='')
    tasks_json = db.Column(db.Text, default='[]')  # JSON array of task objects
    created_by = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=True)
    created_at = db.Column(db.String(30), default='')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'icon': self.icon,
            'description': self.description,
            'tasks': json.loads(self.tasks_json) if self.tasks_json else [],
            'created_by': self.created_by, 'created_at': self.created_at,
        }


class HomeTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), default='')
    sqft = db.Column(db.Integer, default=0)
    stories = db.Column(db.Integer, default=1)
    bedrooms = db.Column(db.Integer, default=0)
    bathrooms = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'sqft': self.sqft,
            'stories': self.stories, 'bedrooms': self.bedrooms, 'bathrooms': self.bathrooms,
        }


class DailyLogs(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    date = db.Column(db.String(20), default='')
    author = db.Column(db.String(100), default='')
    weather = db.Column(db.String(100), default='')
    notes = db.Column(db.Text, default='')
    workers = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id, 'date': self.date,
            'author': self.author, 'weather': self.weather,
            'notes': self.notes, 'workers': self.workers,
        }


class Todos(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    task = db.Column(db.String(255), default='')
    assignee = db.Column(db.String(100), default='')
    due_date = db.Column(db.String(20), default='')
    priority = db.Column(db.String(20), default='medium')
    done = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id, 'task': self.task,
            'assignee': self.assignee, 'due_date': self.due_date,
            'priority': self.priority, 'done': self.done,
        }


class Documents(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    name = db.Column(db.String(200), default='')
    category = db.Column(db.String(100), default='General')
    media_type = db.Column(db.String(20), default='document')   # document | photo | video
    file_size = db.Column(db.Integer, default=0)
    uploaded_by = db.Column(db.String(100), default='')
    created_at = db.Column(db.String(20), default='')

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id, 'name': self.name,
            'category': self.category, 'media_type': self.media_type,
            'file_size': self.file_size, 'uploaded_by': self.uploaded_by,
            'created_at': self.created_at,
        }


# ============================================================
# DATE HELPER FUNCTIONS (for server-side cascade)
# ============================================================

def _to_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, '%Y-%m-%d')
    except (ValueError, TypeError):
        return None

def _fmt(d):
    return d.strftime('%Y-%m-%d')

def _add_workdays(d, n):
    if n == 0:
        return d
    direction = 1 if n > 0 else -1
    remaining = abs(n)
    while remaining > 0:
        d += timedelta(days=direction)
        if d.weekday() < 5:  # Mon-Fri
            remaining -= 1
    return d

def _workday_count(start_str, end_str):
    a = _to_date(start_str)
    b = _to_date(end_str)
    if not a or not b:
        return 1
    count = 0
    d = a
    while d <= b:
        if d.weekday() < 5:
            count += 1
        d += timedelta(days=1)
    return count or 1

def _calc_end_from_workdays(start_str, wd):
    d = _to_date(start_str)
    if not d or wd < 1:
        return start_str
    remaining = wd - 1
    while remaining > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            remaining -= 1
    return _fmt(d)

def _calc_start_from_pred(pred, rel_type, lag_days):
    lag = int(lag_days or 0)
    if rel_type == 'SS':
        base = _to_date(pred.start_date)
        if not base:
            return None
        return _fmt(base if lag == 0 else _add_workdays(base, lag))
    # FS
    base = _to_date(pred.end_date)
    if not base:
        return None
    start = _add_workdays(base, 1)
    if lag != 0:
        start = _add_workdays(start, lag)
    return _fmt(start)


# ============================================================
# AUTH ROUTES
# ============================================================

@app.route('/register', methods=['POST'])
def register_user():
    try:
        data = request.get_json()
        required = ('username', 'password', 'firstName', 'lastName')
        if not data or not all(k in data for k in required):
            return jsonify({'error': 'Missing required fields'}), 400

        if LoginInfo.query.filter_by(username=data['username']).first():
            return jsonify({'error': 'Email already registered'}), 409

        new_user = LoginInfo(
            username=data['username'],
            password=data['password'],
            firstName=data['firstName'],
            lastName=data['lastName'],
            companyName=data.get('companyName', ''),
            role=data.get('role', 'builder'),
            phone=data.get('phone', ''),
            trades=data.get('trades', ''),
        )
        db.session.add(new_user)
        db.session.commit()
        return jsonify({'message': 'User registered', 'user': new_user.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/login', methods=['POST'])
def login_user():
    try:
        data = request.get_json()
        if not data or not all(k in data for k in ('username', 'password')):
            return jsonify({'error': 'Missing username or password'}), 400

        user = LoginInfo.query.filter_by(username=data['username']).first()
        if not user or not user.active:
            return jsonify({'error': 'Invalid email or password'}), 401
        if not check_password_hash(user.password, data['password']):
            return jsonify({'error': 'Invalid email or password'}), 401

        return jsonify({'message': 'Login successful', 'user': user.to_dict()}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/change-password', methods=['POST'])
def change_password():
    try:
        data = request.get_json()
        user = LoginInfo.query.get(data['user_id'])
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if not check_password_hash(user.password, data['current_password']):
            return jsonify({'error': 'Current password incorrect'}), 401
        if len(data.get('new_password', '')) < 8:
            return jsonify({'error': 'New password must be 8+ characters'}), 400
        user.password = generate_password_hash(data['new_password'])
        db.session.commit()
        return jsonify({'message': 'Password changed'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/users/<int:uid>/logo', methods=['GET'])
def get_user_logo(uid):
    """Get a user's company logo."""
    u = LoginInfo.query.get_or_404(uid)
    return jsonify({'logo': u.company_logo or ''})


@app.route('/users/<int:uid>/logo', methods=['PUT'])
def set_user_logo(uid):
    """Set or update a user's company logo (base64)."""
    u = LoginInfo.query.get_or_404(uid)
    data = request.get_json()
    u.company_logo = data.get('logo', '')
    db.session.commit()
    return jsonify({'message': 'Logo updated', 'has_logo': bool(u.company_logo)})


@app.route('/builder-logo', methods=['GET'])
def get_builder_logo():
    """Get the first builder's logo (for non-builder users to see branding)."""
    builder = LoginInfo.query.filter_by(role='builder').first()
    if builder and builder.company_logo:
        return jsonify({'logo': builder.company_logo})
    return jsonify({'logo': ''})


# ============================================================
# USER MANAGEMENT ROUTES (builder only)
# ============================================================

@app.route('/users', methods=['GET'])
def get_all_users():
    users = LoginInfo.query.all()
    return jsonify([u.to_dict() for u in users])


@app.route('/users', methods=['POST'])
def create_user():
    """Create a new user (admin/builder action)."""
    try:
        data = request.get_json()
        required = ('username', 'password', 'firstName', 'lastName')
        if not data or not all(k in data for k in required):
            return jsonify({'error': 'Missing required fields'}), 400
        if LoginInfo.query.filter_by(username=data['username']).first():
            return jsonify({'error': 'Email already exists'}), 409

        new_user = LoginInfo(
            username=data['username'],
            password=data['password'],
            firstName=data['firstName'],
            lastName=data['lastName'],
            companyName=data.get('companyName', ''),
            role=data.get('role', 'contractor'),
            phone=data.get('phone', ''),
            trades=data.get('trades', ''),
            street_address=data.get('street_address', ''),
            city=data.get('city', ''),
            state=data.get('state', ''),
            zip_code=data.get('zip_code', ''),
        )
        db.session.add(new_user)
        db.session.commit()
        return jsonify(new_user.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/users/<int:user_id>/toggle-active', methods=['PUT'])
def toggle_user_active(user_id):
    user = LoginInfo.query.get_or_404(user_id)
    user.active = not user.active
    db.session.commit()
    return jsonify(user.to_dict())


@app.route('/users/<int:user_id>/reset-password', methods=['PUT'])
def reset_user_password(user_id):
    data = request.get_json()
    user = LoginInfo.query.get_or_404(user_id)
    if len(data.get('password', '')) < 8:
        return jsonify({'error': 'Min 8 characters'}), 400
    user.password = generate_password_hash(data['password'])
    db.session.commit()
    return jsonify({'message': 'Password reset'})


@app.route('/users/<int:user_id>/theme', methods=['PUT'])
def update_theme_preference(user_id):
    data = request.get_json()
    user = LoginInfo.query.get_or_404(user_id)
    pref = data.get('theme_preference', 'system')
    if pref not in ('system', 'dark', 'light'):
        return jsonify({'error': 'Invalid theme preference'}), 400
    user.theme_preference = pref
    db.session.commit()
    return jsonify({'theme_preference': user.theme_preference})


@app.route('/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    """Update user profile fields (name, company, phone, trades, address, email)."""
    user = LoginInfo.query.get_or_404(user_id)
    data = request.get_json()

    if 'firstName' in data:
        user.firstName = data['firstName']
    if 'lastName' in data:
        user.lastName = data['lastName']
    if 'companyName' in data:
        user.companyName = data['companyName']
    if 'phone' in data:
        user.phone = data['phone']
    if 'trades' in data:
        user.trades = data['trades']
    if 'email' in data:
        user.username = data['email']
    if 'street_address' in data:
        user.street_address = data['street_address']
    if 'city' in data:
        user.city = data['city']
    if 'state' in data:
        user.state = data['state']
    if 'zip_code' in data:
        user.zip_code = data['zip_code']

    db.session.commit()
    return jsonify(user.to_dict())


# ============================================================
# PROJECTS ROUTES
# ============================================================

# ============================================================
# SUBDIVISIONS
# ============================================================

@app.route('/subdivisions', methods=['GET'])
def get_subdivisions():
    subs = Subdivision.query.order_by(Subdivision.name).all()
    return jsonify([s.to_dict() for s in subs])

@app.route('/subdivisions', methods=['POST'])
def create_subdivision():
    data = request.get_json()
    name = (data or {}).get('name', '').strip()
    if not name:
        return jsonify({'error': 'Subdivision name required'}), 400
    s = Subdivision(name=name)
    db.session.add(s)
    db.session.commit()
    return jsonify(s.to_dict()), 201

@app.route('/subdivisions/<int:sid>', methods=['PUT'])
def update_subdivision(sid):
    s = Subdivision.query.get_or_404(sid)
    data = request.get_json()
    name = (data or {}).get('name', '').strip()
    if name:
        s.name = name
    db.session.commit()
    return jsonify(s.to_dict())

@app.route('/subdivisions/<int:sid>', methods=['DELETE'])
def delete_subdivision(sid):
    s = Subdivision.query.get_or_404(sid)
    # Unlink projects from this subdivision
    Projects.query.filter_by(subdivision_id=sid).update({'subdivision_id': None})
    db.session.delete(s)
    db.session.commit()
    return jsonify({'deleted': True})


@app.route('/projects', methods=['GET'])
def get_projects():
    """Get projects. Optional ?user_id=X&role=Y to filter by role."""
    user_id = request.args.get('user_id', type=int)
    role = request.args.get('role', '')

    if not user_id or role == 'builder':
        # Builders see all projects
        projects = Projects.query.all()
    elif role == 'customer':
        projects = Projects.query.filter_by(customer_id=user_id).all()
    else:
        # Contractors: see projects they are assigned to
        job_ids = [ju.job_id for ju in JobUsers.query.filter_by(user_id=user_id).all()]
        projects = Projects.query.filter(Projects.id.in_(job_ids)).all() if job_ids else []

    result = []
    for p in projects:
        # Non-builders only see go_live projects
        if role and role != 'builder' and not p.go_live:
            continue
        d = p.to_dict()
        if p.customer_id:
            cust = LoginInfo.query.get(p.customer_id)
            if cust:
                d['customer_name'] = f'{cust.firstName} {cust.lastName}'.strip()
        result.append(d)
    return jsonify(result)


@app.route('/projects', methods=['POST'])
def add_project():
    try:
        data = request.get_json()
        if not data or not data.get('name'):
            return jsonify({'error': 'Project name required'}), 400

        # --- Auto-create homeowner user if email provided ---
        customer_id = data.get('customer_id')
        email = data.get('email', '').strip().lower()
        customer_first = data.get('customer_first_name', '').strip()
        customer_last = data.get('customer_last_name', '').strip()

        if email and not customer_id:
            existing = LoginInfo.query.filter_by(username=email).first()
            if existing:
                # Link to existing user
                customer_id = existing.id
            else:
                # Create new homeowner with default password "Liberty"
                new_customer = LoginInfo(
                    username=email,
                    password='Liberty',
                    firstName=customer_first or 'Homeowner',
                    lastName=customer_last or data.get('name', '').split()[0],
                    companyName='',
                    role='customer',
                    phone=data.get('customer_phone', ''),
                )
                db.session.add(new_customer)
                db.session.flush()  # Get the id before committing
                customer_id = new_customer.id

        p = Projects()
        for key in ('name', 'address', 'street_address', 'city', 'state', 'zip_code',
                     'status', 'phase',
                     'start_date', 'est_completion', 'progress', 'original_price',
                     'contract_price', 'sqft', 'bedrooms', 'bathrooms', 'garage',
                     'lot_size', 'style', 'stories', 'email', 'dates_from_schedule', 'go_live', 'subdivision_id'):
            if key in data:
                setattr(p, key, data[key])

        # Auto-compute combined address from parts
        parts = [p.street_address or '', p.city or '']
        if p.state:
            parts.append(p.state)
        if p.zip_code:
            parts.append(p.zip_code)
        combined = ', '.join([x for x in parts[:2] if x])
        if p.state or p.zip_code:
            combined += ' ' + ' '.join([x for x in [p.state, p.zip_code] if x])
        p.address = combined.strip() or p.address or ''

        # --- Auto-generate project number: YY-NN ---
        yy = datetime.utcnow().strftime('%y')  # e.g. "26"
        prefix = f'{yy}-'
        existing = Projects.query.filter(Projects.number.like(f'{prefix}%')).all()
        max_num = 0
        for proj in existing:
            try:
                num = int(proj.number.split('-')[1])
                if num > max_num:
                    max_num = num
            except (IndexError, ValueError):
                pass
        p.number = f'{prefix}{str(max_num + 1).zfill(2)}'

        p.customer_id = customer_id
        db.session.add(p)
        db.session.commit()
        return jsonify(p.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/projects/<int:project_id>', methods=['GET'])
def get_project(project_id):
    return jsonify(Projects.query.get_or_404(project_id).to_dict())


@app.route('/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    p = Projects.query.get_or_404(project_id)
    data = request.get_json()

    # Detect go_live activation (false -> true)
    going_live = data.get('go_live') and not p.go_live

    for key in ('name', 'number', 'address', 'street_address', 'city', 'state', 'zip_code',
                 'status', 'phase', 'customer_id',
                 'start_date', 'est_completion', 'progress', 'original_price',
                 'contract_price', 'sqft', 'bedrooms', 'bathrooms', 'garage',
                 'lot_size', 'style', 'stories', 'email', 'reconciliation', 'dates_from_schedule', 'go_live', 'subdivision_id'):
        if key in data:
            # Prevent un-toggling go_live once it's been set
            if key == 'go_live' and p.go_live and not data[key]:
                continue
            setattr(p, key, data[key])

    # Auto-compute combined address from parts if any part was updated
    if any(k in data for k in ('street_address', 'city', 'state', 'zip_code')):
        parts = [p.street_address or '', p.city or '']
        combined = ', '.join([x for x in parts if x])
        suffix = ' '.join([x for x in [p.state or '', p.zip_code or ''] if x])
        if suffix:
            combined += ' ' + suffix if combined else suffix
        p.address = combined.strip()

    # When going live, snapshot all task dates as baselines
    if going_live:
        tasks = Schedule.query.filter_by(job_id=project_id).all()
        for t in tasks:
            t.baseline_start = t.start_date or ''
            t.baseline_end = t.end_date or ''

    db.session.commit()
    return jsonify(p.to_dict())


@app.route('/projects/<int:project_id>/hold', methods=['POST'])
def toggle_project_hold(project_id):
    """Toggle on-hold status. PUT on hold stores date; release calculates days and pushes tasks."""
    p = Projects.query.get_or_404(project_id)
    data = request.get_json() or {}
    action = data.get('action')  # 'hold' or 'release'

    if action == 'hold':
        if p.on_hold:
            return jsonify({'error': 'Project is already on hold'}), 400
        today_str = _fmt(datetime.utcnow())
        p.on_hold = True
        p.hold_start_date = today_str
        db.session.commit()
        return jsonify(p.to_dict())

    elif action == 'release':
        if not p.on_hold:
            return jsonify({'error': 'Project is not on hold'}), 400

        hold_start = _to_date(p.hold_start_date)
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        if not hold_start:
            hold_start = today

        # Calculate workdays on hold
        hold_days = 0
        d = hold_start
        while d < today:
            d += timedelta(days=1)
            if d.weekday() < 5:
                hold_days += 1
        if hold_days < 1:
            hold_days = 1  # minimum 1 day

        tasks = Schedule.query.filter_by(job_id=project_id).order_by(Schedule.start_date).all()
        today_str = _fmt(today)

        # Find in-progress task: started but not complete
        in_progress = None
        for t in tasks:
            if t.start_date and t.start_date <= today_str and t.progress < 100 and not t.is_exception:
                if not in_progress or t.start_date > in_progress.start_date:
                    in_progress = t

        if in_progress:
            # Extend the in-progress task's end_date by hold_days
            old_end = _to_date(in_progress.end_date)
            if old_end:
                new_end = _add_workdays(old_end, hold_days)
                in_progress.end_date = _fmt(new_end)

            # Push all tasks that come after the in-progress task
            for t in tasks:
                if t.id == in_progress.id:
                    continue
                if t.start_date and t.start_date > in_progress.start_date:
                    old_s = _to_date(t.start_date)
                    old_e = _to_date(t.end_date)
                    if old_s:
                        t.start_date = _fmt(_add_workdays(old_s, hold_days))
                    if old_e:
                        t.end_date = _fmt(_add_workdays(old_e, hold_days))
        else:
            # No in-progress task — push all future tasks
            for t in tasks:
                if t.start_date and t.start_date >= today_str:
                    old_s = _to_date(t.start_date)
                    old_e = _to_date(t.end_date)
                    if old_s:
                        t.start_date = _fmt(_add_workdays(old_s, hold_days))
                    if old_e:
                        t.end_date = _fmt(_add_workdays(old_e, hold_days))

        # Log it
        now = datetime.utcnow().isoformat()
        log = ScheduleEditLog(
            schedule_id=in_progress.id if in_progress else 0,
            job_id=project_id,
            task_name=in_progress.task if in_progress else 'All Tasks',
            field_changed='on_hold_release',
            old_value=p.hold_start_date,
            new_value=today_str,
            reason=f'Hold released after {hold_days} workday(s)',
            edited_by=data.get('edited_by', ''),
            edited_at=now,
        )
        db.session.add(log)

        p.on_hold = False
        p.hold_start_date = ''
        db.session.commit()
        sync_project_dates(project_id)

        # Return updated schedule with project
        all_tasks = Schedule.query.filter_by(job_id=project_id).order_by(Schedule.start_date).all()
        return jsonify({'project': p.to_dict(), 'schedule': [t.to_dict() for t in all_tasks]})

    return jsonify({'error': 'Action must be "hold" or "release"'}), 400


@app.route('/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    p = Projects.query.get_or_404(project_id)

    # Delete all related data
    schedule_items = Schedule.query.filter_by(job_id=project_id).all()
    for s in schedule_items:
        ScheduleEditLog.query.filter_by(schedule_id=s.id).delete()
    Schedule.query.filter_by(job_id=project_id).delete()
    JobUsers.query.filter_by(job_id=project_id).delete()
    ChangeOrders.query.filter_by(job_id=project_id).delete()
    ProjectSelection.query.filter_by(job_id=project_id).delete()
    DailyLogs.query.filter_by(job_id=project_id).delete()
    Todos.query.filter_by(job_id=project_id).delete()
    Documents.query.filter_by(job_id=project_id).delete()
    WorkdayExemption.query.filter(WorkdayExemption.job_id == project_id).delete()

    db.session.delete(p)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 200


# ============================================================
# EMPLOYEES (sub's crew members)
# ============================================================

@app.route('/users/<int:uid>/employees', methods=['GET'])
def get_employees(uid):
    emps = Employee.query.filter_by(sub_id=uid).order_by(Employee.name).all()
    return jsonify([e.to_dict() for e in emps])


@app.route('/users/<int:uid>/employees', methods=['POST'])
def add_employee(uid):
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    emp = Employee(
        sub_id=uid,
        name=name,
        job_description=data.get('job_description', '').strip(),
        phone=data.get('phone', '').strip(),
    )
    db.session.add(emp)
    db.session.commit()
    return jsonify(emp.to_dict()), 201


@app.route('/employees/<int:eid>', methods=['PUT'])
def update_employee(eid):
    emp = Employee.query.get_or_404(eid)
    data = request.get_json()
    if 'name' in data:
        emp.name = data['name'].strip()
    if 'job_description' in data:
        emp.job_description = data['job_description'].strip()
    if 'phone' in data:
        emp.phone = data['phone'].strip()
    db.session.commit()
    return jsonify(emp.to_dict())


@app.route('/employees/<int:eid>', methods=['DELETE'])
def delete_employee(eid):
    emp = Employee.query.get_or_404(eid)
    db.session.delete(emp)
    db.session.commit()
    return jsonify({'deleted': True})


# ============================================================
# JOB-USERS (assign contractors/customers to projects)
# ============================================================

@app.route('/projects/<int:pid>/users', methods=['GET'])
def get_job_users(pid):
    jus = JobUsers.query.filter_by(job_id=pid).all()
    result = []
    for ju in jus:
        u = LoginInfo.query.get(ju.user_id)
        entry = ju.to_dict()
        if u:
            entry['user'] = u.to_dict()
        result.append(entry)
    return jsonify(result)


@app.route('/projects/<int:pid>/users', methods=['POST'])
def add_job_user(pid):
    data = request.get_json()
    ju = JobUsers(job_id=pid, user_id=data['user_id'], role=data.get('role', 'contractor'))
    db.session.add(ju)
    db.session.commit()
    return jsonify(ju.to_dict()), 201


@app.route('/users/<int:uid>/projects', methods=['GET'])
def get_user_projects(uid):
    """Get all projects a user is assigned to via JobUsers or schedule tasks."""
    # Projects assigned via JobUsers
    jus = JobUsers.query.filter_by(user_id=uid).all()
    job_ids = set(ju.job_id for ju in jus)
    # Also check schedule for contractor name match
    u = LoginInfo.query.get(uid)
    if u:
        contractor_name = f'{u.firstName} {u.lastName}'
        from sqlalchemy import or_
        tasks = Schedule.query.filter(
            or_(Schedule.contractor == contractor_name, Schedule.contractor == u.companyName)
        ).all()
        for t in tasks:
            job_ids.add(t.job_id)
    projects = Projects.query.filter(Projects.id.in_(job_ids)).all() if job_ids else []
    # Non-builders only see go_live projects
    if u and u.role != 'builder':
        projects = [p for p in projects if p.go_live]
    return jsonify([p.to_dict() for p in projects])


@app.route('/users/<int:uid>/tasks', methods=['GET'])
def get_user_tasks(uid):
    """Get all schedule tasks assigned to a user by contractor name."""
    u = LoginInfo.query.get_or_404(uid)
    viewer_role = request.args.get('viewer_role', '')
    contractor_name = f'{u.firstName} {u.lastName}'
    from sqlalchemy import or_
    tasks = Schedule.query.filter(
        or_(Schedule.contractor == contractor_name, Schedule.contractor == u.companyName)
    ).all()
    result = []
    for t in tasks:
        proj = Projects.query.get(t.job_id)
        # Non-builders only see tasks from go_live projects (unless a builder is viewing)
        if viewer_role != 'builder' and u.role != 'builder' and proj and not proj.go_live:
            continue
        td = t.to_dict()
        if proj:
            td['project_name'] = proj.name
            td['project_number'] = proj.number
            td['go_live'] = bool(proj.go_live) if proj.go_live else False
            td['on_hold'] = bool(proj.on_hold) if proj.on_hold else False
        result.append(td)
    return jsonify(result)


# ============================================================
# CHANGE ORDERS
# ============================================================

@app.route('/projects/<int:pid>/change-orders', methods=['GET'])
def get_change_orders(pid):
    cos = ChangeOrders.query.filter_by(job_id=pid).order_by(ChangeOrders.created_at.desc()).all()
    return jsonify([co.to_dict() for co in cos])


@app.route('/projects/<int:pid>/change-orders', methods=['POST'])
def add_change_order(pid):
    data = request.get_json()
    today = datetime.utcnow().strftime('%Y-%m-%d')
    co = ChangeOrders(
        job_id=pid, title=data['title'], description=data.get('description', ''),
        amount=data.get('amount', 0), status='pending_customer',
        builder_sig=True, builder_sig_date=today,
        customer_sig=False, customer_sig_date=None, created_at=today,
    )
    db.session.add(co)
    db.session.commit()
    return jsonify(co.to_dict()), 201


@app.route('/change-orders/<int:co_id>/sign', methods=['PUT'])
def sign_change_order(co_id):
    data = request.get_json()
    co = ChangeOrders.query.get_or_404(co_id)
    today = datetime.utcnow().strftime('%Y-%m-%d')
    role = data.get('role', '')

    if role == 'builder':
        co.builder_sig = True
        co.builder_sig_date = today
    elif role == 'customer':
        co.customer_sig = True
        co.customer_sig_date = today

    if co.builder_sig and co.customer_sig:
        co.status = 'approved'
        # Update project contract price
        project = Projects.query.get(co.job_id)
        if project:
            approved = ChangeOrders.query.filter_by(job_id=co.job_id, status='approved').all()
            # Include this one since we just set it
            total = project.original_price + sum(c.amount for c in approved)
            if co not in approved:
                total += co.amount
            project.contract_price = total
    else:
        co.status = 'pending_customer' if co.builder_sig else 'pending_builder'

    db.session.commit()
    return jsonify(co.to_dict())


# ============================================================
# SELECTIONS - GLOBAL CATALOG
# ============================================================

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    from flask import send_from_directory
    return send_from_directory(UPLOAD_DIR, filename)


@app.route('/upload-image', methods=['POST'])
def upload_image():
    """Accept base64 image data and save to disk"""
    data = request.get_json()
    b64 = data.get('image', '')
    # Strip data URI prefix if present
    if ',' in b64:
        b64 = b64.split(',', 1)[1]
    ext = data.get('ext', 'jpg')
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, 'wb') as f:
        f.write(base64.b64decode(b64))
    return jsonify({'path': f'/uploads/{filename}'}), 201


@app.route('/selection-items', methods=['GET'])
def get_selection_items():
    items = SelectionItem.query.order_by(SelectionItem.category, SelectionItem.item).all()
    return jsonify([i.to_dict() for i in items])


@app.route('/selection-items', methods=['POST'])
def create_selection_item():
    data = request.get_json()
    item = SelectionItem(
        category=data.get('category', ''),
        item=data.get('item', ''),
        options=json.dumps(data.get('options', [])),
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@app.route('/selection-items/<int:sid>', methods=['PUT'])
def update_selection_item(sid):
    item = SelectionItem.query.get_or_404(sid)
    data = request.get_json()
    if 'category' in data: item.category = data['category']
    if 'item' in data: item.item = data['item']
    if 'options' in data: item.options = json.dumps(data['options'])
    db.session.commit()
    return jsonify(item.to_dict())


@app.route('/selection-items/<int:sid>', methods=['DELETE'])
def delete_selection_item(sid):
    item = SelectionItem.query.get_or_404(sid)
    # Also delete project selections referencing this
    ProjectSelection.query.filter_by(selection_item_id=sid).delete()
    db.session.delete(item)
    db.session.commit()
    return jsonify({'ok': True})


# ============================================================
# SELECTIONS - PER PROJECT
# ============================================================

@app.route('/projects/<int:pid>/selections', methods=['GET'])
def get_project_selections(pid):
    """Get all selections for a project - auto-creates ProjectSelection rows for any new catalog items"""
    all_items = SelectionItem.query.all()
    existing = {ps.selection_item_id: ps for ps in ProjectSelection.query.filter_by(job_id=pid).all()}
    result = []
    for item in all_items:
        if item.id not in existing:
            ps = ProjectSelection(job_id=pid, selection_item_id=item.id, status='pending')
            db.session.add(ps)
            existing[item.id] = ps
    db.session.commit()
    for item in all_items:
        ps = existing.get(item.id)
        if ps:
            result.append(ps.to_dict())
    return jsonify(result)


@app.route('/project-selections/<int:psid>', methods=['PUT'])
def update_project_selection(psid):
    ps = ProjectSelection.query.get_or_404(psid)
    data = request.get_json()
    if 'selected' in data:
        ps.selected = data['selected']
        if ps.status != 'confirmed':
            ps.status = 'selected'
    if data.get('confirm'):
        ps.status = 'confirmed'
    db.session.commit()
    return jsonify(ps.to_dict())


# ============================================================
# SCHEDULE
# ============================================================

def sync_project_dates(job_id):
    """If project has dates_from_schedule=True, update start/end from schedule tasks."""
    project = Projects.query.get(job_id)
    if not project or not project.dates_from_schedule:
        return
    tasks = Schedule.query.filter_by(job_id=job_id).all()
    starts = [t.start_date for t in tasks if t.start_date]
    ends = [t.end_date for t in tasks if t.end_date]
    if starts:
        project.start_date = min(starts)
    if ends:
        project.est_completion = max(ends)
    db.session.commit()


@app.route('/projects/<int:pid>/schedule', methods=['GET'])
def get_schedule(pid):
    items = Schedule.query.filter_by(job_id=pid).order_by(Schedule.start_date).all()
    return jsonify([i.to_dict() for i in items])


@app.route('/projects/<int:pid>/schedule', methods=['POST'])
def add_schedule_item(pid):
    data = request.get_json()

    # Support batch creation: if data is a list, create multiple items
    if isinstance(data, list):
        proj = Projects.query.get(pid)
        is_live = proj and proj.go_live
        items = []
        pred_indices = []  # track which items need predecessor wiring
        for d in data:
            start = d.get('start_date', '')
            end = d.get('end_date', '')
            item = Schedule(
                job_id=pid, task=d.get('task', ''),
                start_date=start, end_date=end,
                baseline_start=start if is_live else '', baseline_end=end if is_live else '',
                progress=d.get('progress', 0),
                contractor=d.get('contractor', ''),
                trade=d.get('trade', ''),
                rel_type=d.get('rel_type', 'FS'),
                lag_days=int(d.get('lag_days', 0) or 0),
            )
            db.session.add(item)
            items.append(item)
            pi = d.get('pred_index')
            pred_indices.append(pi)
            print(f"  [SCHED] Task '{d.get('task')}' pred_index={pi} rel_type={d.get('rel_type')} lag_days={d.get('lag_days')}")
        db.session.flush()  # assign IDs before wiring predecessors

        # Wire predecessor references by batch index -> actual DB ID
        for i, pi in enumerate(pred_indices):
            if pi is not None and isinstance(pi, int) and 0 <= pi < len(items):
                items[i].predecessor_id = items[pi].id
                items[i].rel_type = items[i].rel_type or 'FS'
                print(f"  [SCHED] Wired: items[{i}].predecessor_id = {items[pi].id} (from index {pi})")

        db.session.commit()
        sync_project_dates(pid)
        result = [i.to_dict() for i in items]
        print(f"  [SCHED] Created {len(result)} items. Predecessors: {[(r['id'], r['predecessor_id']) for r in result]}")
        return jsonify(result), 201

    # Single item creation
    start = data.get('start_date', '')
    end = data.get('end_date', '')
    # Only set baselines if project is already live
    proj = Projects.query.get(pid)
    is_live = proj and proj.go_live
    item = Schedule(
        job_id=pid, task=data.get('task', ''),
        start_date=start, end_date=end,
        baseline_start=start if is_live else '',
        baseline_end=end if is_live else '',
        progress=data.get('progress', 0),
        contractor=data.get('contractor', ''),
        trade=data.get('trade', ''),
        predecessor_id=data.get('predecessor_id'),
        rel_type=data.get('rel_type', 'FS'),
        lag_days=int(data.get('lag_days', 0)),
    )
    db.session.add(item)
    db.session.commit()
    sync_project_dates(pid)
    return jsonify(item.to_dict()), 201


@app.route('/schedule/<int:item_id>', methods=['PUT'])
def update_schedule_item(item_id):
    item = Schedule.query.get_or_404(item_id)
    data = request.get_json()

    # Block date changes while project is on hold
    proj = Projects.query.get(item.job_id)
    if proj and proj.on_hold:
        if ('start_date' in data and data['start_date'] != item.start_date) or \
           ('end_date' in data and data['end_date'] != item.end_date):
            return jsonify({'error': 'Cannot modify dates while project is on hold'}), 400

    # Enforce go_live restrictions: can move earlier or shorten, but not delay or extend
    # Exceptions are exempt — their duration can be freely changed
    if proj and proj.go_live and not item.is_exception:
        if 'start_date' in data and data['start_date'] and item.start_date:
            if data['start_date'] > item.start_date:
                return jsonify({'error': 'Cannot delay task start date after Go Live'}), 400
        if 'end_date' in data and data['end_date'] and item.end_date:
            if data['end_date'] > item.end_date:
                return jsonify({'error': 'Cannot extend task end date after Go Live'}), 400

    for k in ('task', 'start_date', 'end_date', 'baseline_start', 'baseline_end',
              'progress', 'contractor', 'trade', 'predecessor_id', 'rel_type', 'lag_days'):
        if k in data:
            setattr(item, k, data[k])
    db.session.commit()
    sync_project_dates(item.job_id)
    return jsonify(item.to_dict())


@app.route('/schedule/batch-update', methods=['PUT'])
def batch_update_schedule():
    """Update multiple schedule items at once (for cascading drag)."""
    data = request.get_json()  # expects list of {id, start_date, end_date, lag_days?}
    if not isinstance(data, list):
        return jsonify({'error': 'Expected a list'}), 400
    updated = []
    for d in data:
        item = Schedule.query.get(d.get('id'))
        if item:
            proj = Projects.query.get(item.job_id)
            # Block date changes while on hold
            if proj and proj.on_hold:
                continue
            # Enforce go_live restrictions: can move earlier/shorten, not delay/extend
            # Exceptions are exempt
            if proj and proj.go_live and not item.is_exception:
                new_start = d.get('start_date', item.start_date)
                new_end = d.get('end_date', item.end_date)
                if new_start and item.start_date and new_start > item.start_date:
                    continue  # skip - can't delay start
                if new_end and item.end_date and new_end > item.end_date:
                    d['end_date'] = item.end_date  # cap - can't extend
            for k in ('start_date', 'end_date', 'lag_days'):
                if k in d:
                    setattr(item, k, d[k])
            updated.append(item)
    db.session.commit()
    job_ids = set(i.job_id for i in updated)
    for jid in job_ids:
        sync_project_dates(jid)
    return jsonify([i.to_dict() for i in updated])


@app.route('/schedule/<int:item_id>', methods=['DELETE'])
def delete_schedule_item(item_id):
    """Delete a single schedule task. Successors lose their predecessor link but keep their start date."""
    item = Schedule.query.get_or_404(item_id)
    job_id = item.job_id

    # Unlink any tasks that had this as predecessor
    successors = Schedule.query.filter_by(job_id=job_id, predecessor_id=item.id).all()
    for s in successors:
        s.predecessor_id = None
        s.rel_type = 'FS'
        s.lag_days = 0

    # Delete edit logs for this task
    ScheduleEditLog.query.filter_by(schedule_id=item.id).delete()

    db.session.delete(item)
    db.session.commit()
    sync_project_dates(job_id)
    return jsonify({'deleted': [item_id], 'unlinked': [s.id for s in successors]})


@app.route('/schedule/<int:item_id>/chain', methods=['DELETE'])
def delete_schedule_chain(item_id):
    """Delete a task and all its successors (the entire chain downstream)."""
    item = Schedule.query.get_or_404(item_id)
    job_id = item.job_id

    # Build the full chain: BFS from this task
    all_tasks = Schedule.query.filter_by(job_id=job_id).all()
    # Map predecessor_id -> list of successors
    succ_map = {}
    for t in all_tasks:
        if t.predecessor_id:
            succ_map.setdefault(t.predecessor_id, []).append(t)

    to_delete = []
    queue = [item]
    while queue:
        current = queue.pop(0)
        to_delete.append(current)
        for child in succ_map.get(current.id, []):
            queue.append(child)

    deleted_ids = [t.id for t in to_delete]

    # Unlink any tasks outside the chain that pointed to a deleted task
    remaining = [t for t in all_tasks if t.id not in set(deleted_ids)]
    for t in remaining:
        if t.predecessor_id in set(deleted_ids):
            t.predecessor_id = None
            t.rel_type = 'FS'
            t.lag_days = 0

    # Delete edit logs and tasks
    for t in to_delete:
        ScheduleEditLog.query.filter_by(schedule_id=t.id).delete()
        db.session.delete(t)

    db.session.commit()
    sync_project_dates(job_id)
    return jsonify({'deleted': deleted_ids})


# ============================================================
# SCHEDULE TEMPLATES
# ============================================================

@app.route('/schedule-templates', methods=['GET'])
def get_schedule_templates():
    templates = ScheduleTemplate.query.order_by(ScheduleTemplate.id.desc()).all()
    return jsonify([t.to_dict() for t in templates])


@app.route('/schedule-templates', methods=['POST'])
def create_schedule_template():
    data = request.get_json()
    tmpl = ScheduleTemplate(
        name=data.get('name', 'Untitled Template'),
        icon=data.get('icon', '📋'),
        description=data.get('description', ''),
        tasks_json=json.dumps(data.get('tasks', [])),
        created_by=data.get('created_by'),
        created_at=datetime.utcnow().isoformat(),
    )
    db.session.add(tmpl)
    db.session.commit()
    return jsonify(tmpl.to_dict()), 201


@app.route('/schedule-templates/<int:tid>', methods=['PUT'])
def update_schedule_template(tid):
    tmpl = ScheduleTemplate.query.get_or_404(tid)
    data = request.get_json()
    if 'name' in data: tmpl.name = data['name']
    if 'icon' in data: tmpl.icon = data['icon']
    if 'description' in data: tmpl.description = data['description']
    if 'tasks' in data: tmpl.tasks_json = json.dumps(data['tasks'])
    db.session.commit()
    return jsonify(tmpl.to_dict())


@app.route('/schedule-templates/<int:tid>', methods=['DELETE'])
def delete_schedule_template(tid):
    tmpl = ScheduleTemplate.query.get_or_404(tid)
    db.session.delete(tmpl)
    db.session.commit()
    return jsonify({'deleted': True})


# ============================================================
# HOME TEMPLATES
# ============================================================

@app.route('/home-templates', methods=['GET'])
def get_home_templates():
    return jsonify([t.to_dict() for t in HomeTemplate.query.order_by(HomeTemplate.name).all()])


@app.route('/home-templates', methods=['POST'])
def create_home_template():
    data = request.get_json()
    t = HomeTemplate(
        name=data.get('name', ''), sqft=int(data.get('sqft', 0)),
        stories=int(data.get('stories', 1)), bedrooms=int(data.get('bedrooms', 0)),
        bathrooms=int(data.get('bathrooms', 0)),
    )
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@app.route('/home-templates/<int:tid>', methods=['PUT'])
def update_home_template(tid):
    t = HomeTemplate.query.get_or_404(tid)
    data = request.get_json()
    for k in ('name', 'sqft', 'stories', 'bedrooms', 'bathrooms'):
        if k in data:
            setattr(t, k, int(data[k]) if k != 'name' else data[k])
    db.session.commit()
    return jsonify(t.to_dict())


@app.route('/home-templates/<int:tid>', methods=['DELETE'])
def delete_home_template(tid):
    t = HomeTemplate.query.get_or_404(tid)
    db.session.delete(t)
    db.session.commit()
    return jsonify({'deleted': True})


@app.route('/schedule/<int:item_id>/edit', methods=['PUT'])
def edit_schedule_with_reason(item_id):
    """Edit a schedule item with a mandatory reason (creates audit log, cascades dependents)."""
    item = Schedule.query.get_or_404(item_id)
    data = request.get_json()
    reason = data.get('reason', '').strip()
    if not reason:
        return jsonify({'error': 'Reason is required'}), 400

    changes = []
    # Block date changes while on hold
    proj = Projects.query.get(item.job_id)
    if proj and proj.on_hold:
        if ('start_date' in data and str(data.get('start_date','')) != str(item.start_date)) or \
           ('end_date' in data and str(data.get('end_date','')) != str(item.end_date)):
            return jsonify({'error': 'Cannot modify dates while project is on hold'}), 400
    # Enforce go_live restrictions (exceptions are exempt)
    is_live = proj and proj.go_live and not item.is_exception
    for k in ('task', 'start_date', 'end_date', 'progress', 'contractor', 'trade',
              'predecessor_id', 'rel_type', 'lag_days'):
        if k in data and str(getattr(item, k)) != str(data[k]):
            # Block backward movement or extension when live
            if is_live and k == 'start_date' and data[k] > (item.start_date or ''):
                return jsonify({'error': 'Cannot delay task start date after Go Live'}), 400
            if is_live and k == 'end_date' and data[k] > (item.end_date or ''):
                return jsonify({'error': 'Cannot extend task end date after Go Live'}), 400
            changes.append({
                'field': k,
                'old': str(getattr(item, k)),
                'new': str(data[k]),
            })
            setattr(item, k, data[k])

    # Log each field change
    now = datetime.utcnow().isoformat()
    for c in changes:
        log = ScheduleEditLog(
            schedule_id=item.id, job_id=item.job_id, task_name=item.task,
            field_changed=c['field'], old_value=c['old'], new_value=c['new'],
            reason=reason, edited_by=data.get('edited_by', ''),
            edited_at=now,
        )
        db.session.add(log)

    # Cascade dependents: recalculate all tasks that depend on this one
    all_items = Schedule.query.filter_by(job_id=item.job_id).all()
    by_id = {t.id: t for t in all_items}
    # Iteratively resolve
    for _ in range(len(all_items) + 1):
        changed = False
        for t in all_items:
            if not t.predecessor_id or t.predecessor_id not in by_id:
                continue
            if t.id == item.id:
                continue  # don't recalculate the edited task
            pred = by_id[t.predecessor_id]
            new_start = _calc_start_from_pred(pred, t.rel_type or 'FS', t.lag_days or 0)
            if new_start and new_start != t.start_date:
                dur = _workday_count(t.start_date, t.end_date)
                t.start_date = new_start
                t.end_date = _calc_end_from_workdays(new_start, dur)
                changed = True
        if not changed:
            break

    db.session.commit()
    sync_project_dates(item.job_id)
    return jsonify([t.to_dict() for t in all_items])


@app.route('/projects/<int:pid>/schedule-edit-log', methods=['GET'])
def get_schedule_edit_log(pid):
    logs = ScheduleEditLog.query.filter_by(job_id=pid).order_by(ScheduleEditLog.id.desc()).all()
    return jsonify([l.to_dict() for l in logs])


@app.route('/projects/<int:pid>/exceptions', methods=['POST'])
def add_exception(pid):
    """Create an exception that inserts into the schedule and pushes dependents back."""
    data = request.get_json()
    name = data.get('name', '').strip()
    exc_date = data.get('date', '')
    duration = int(data.get('duration', 1) or 1)
    task_id = data.get('task_id')
    description = data.get('description', '').strip()

    if not name or not exc_date or not task_id or not description:
        return jsonify({'error': 'All fields are required'}), 400

    target_task = Schedule.query.get(task_id)
    if not target_task or target_task.job_id != pid:
        return jsonify({'error': 'Task not found'}), 404

    # Calculate exception end date from start + workdays
    end_date = _calc_end_from_workdays(exc_date, duration)

    # Create exception schedule item
    exc = Schedule(
        job_id=pid, task=name,
        start_date=exc_date, end_date=end_date,
        baseline_start='', baseline_end='',
        progress=0, contractor='',
        predecessor_id=task_id,
        rel_type='FS', lag_days=0,
        is_exception=True,
        exception_description=description,
    )
    db.session.add(exc)
    db.session.flush()  # Get the exception's ID

    # Rewire: tasks that had target_task as predecessor now point to the exception
    dependents = Schedule.query.filter_by(job_id=pid, predecessor_id=task_id).all()
    for dep in dependents:
        if dep.id != exc.id:
            dep.predecessor_id = exc.id

    # Cascade all dates from the exception forward
    all_items = Schedule.query.filter_by(job_id=pid).all()
    by_id = {t.id: t for t in all_items}
    for _ in range(len(all_items) + 1):
        changed = False
        for t in all_items:
            if not t.predecessor_id or t.predecessor_id not in by_id:
                continue
            if t.id == task_id:
                continue  # don't recalculate the target task itself
            pred = by_id[t.predecessor_id]
            new_start = _calc_start_from_pred(pred, t.rel_type or 'FS', t.lag_days or 0)
            if new_start and new_start != t.start_date:
                dur = _workday_count(t.start_date, t.end_date)
                t.start_date = new_start
                t.end_date = _calc_end_from_workdays(new_start, dur)
                changed = True
        if not changed:
            break

    # Log the exception creation
    now = datetime.utcnow().isoformat()
    log = ScheduleEditLog(
        schedule_id=target_task.id, job_id=pid, task_name=target_task.task,
        field_changed='exception', old_value='', new_value=f'{name} ({duration}d)',
        reason=description, edited_by=data.get('edited_by', ''),
        edited_at=now,
    )
    db.session.add(log)

    db.session.commit()
    sync_project_dates(pid)
    return jsonify([t.to_dict() for t in all_items]), 201


# ============================================================
# WORKDAY EXEMPTIONS
# ============================================================

@app.route('/workday-exemptions', methods=['GET'])
def get_all_workday_exemptions():
    exemptions = WorkdayExemption.query.order_by(WorkdayExemption.date).all()
    return jsonify([e.to_dict() for e in exemptions])


@app.route('/workday-exemptions', methods=['POST'])
def add_global_workday_exemption():
    data = request.get_json()
    date_str = data.get('date', '')
    if not date_str:
        return jsonify({'error': 'Date is required'}), 400
    existing = WorkdayExemption.query.filter_by(date=date_str, job_id=None).first()
    if existing:
        return jsonify({'error': 'Exemption already exists for this date'}), 400
    exemption = WorkdayExemption(
        job_id=None,
        date=date_str,
        description=data.get('description', ''),
        recurring=data.get('recurring', False),
        created_by=data.get('created_by', ''),
    )
    db.session.add(exemption)
    db.session.commit()
    return jsonify(exemption.to_dict()), 201


@app.route('/projects/<int:pid>/workday-exemptions', methods=['GET'])
def get_workday_exemptions(pid):
    exemptions = WorkdayExemption.query.filter(
        (WorkdayExemption.job_id == pid) | (WorkdayExemption.job_id == None)
    ).order_by(WorkdayExemption.date).all()
    return jsonify([e.to_dict() for e in exemptions])


@app.route('/projects/<int:pid>/workday-exemptions', methods=['POST'])
def add_workday_exemption(pid):
    data = request.get_json()
    date_str = data.get('date', '')
    if not date_str:
        return jsonify({'error': 'Date is required'}), 400
    # Prevent duplicates
    existing = WorkdayExemption.query.filter_by(job_id=pid, date=date_str).first()
    if existing:
        return jsonify({'error': 'Exemption already exists for this date'}), 400
    exemption = WorkdayExemption(
        job_id=pid,
        date=date_str,
        description=data.get('description', ''),
        recurring=data.get('recurring', False),
        created_by=data.get('created_by', ''),
    )
    db.session.add(exemption)
    db.session.commit()
    return jsonify(exemption.to_dict()), 201


@app.route('/workday-exemptions/<int:eid>', methods=['DELETE'])
def delete_workday_exemption(eid):
    exemption = WorkdayExemption.query.get_or_404(eid)
    db.session.delete(exemption)
    db.session.commit()
    return jsonify({'ok': True})


# ============================================================
# DAILY LOGS
# ============================================================

@app.route('/projects/<int:pid>/daily-logs', methods=['GET'])
def get_daily_logs(pid):
    logs = DailyLogs.query.filter_by(job_id=pid).order_by(DailyLogs.date.desc()).all()
    return jsonify([l.to_dict() for l in logs])


@app.route('/projects/<int:pid>/daily-logs', methods=['POST'])
def add_daily_log(pid):
    data = request.get_json()
    log = DailyLogs(
        job_id=pid, date=data.get('date', datetime.utcnow().strftime('%Y-%m-%d')),
        author=data.get('author', ''), weather=data.get('weather', ''),
        notes=data.get('notes', ''), workers=data.get('workers', 0),
    )
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


# ============================================================
# TODOS
# ============================================================

@app.route('/projects/<int:pid>/todos', methods=['GET'])
def get_todos(pid):
    items = Todos.query.filter_by(job_id=pid).order_by(Todos.due_date).all()
    return jsonify([t.to_dict() for t in items])


@app.route('/projects/<int:pid>/todos', methods=['POST'])
def add_todo(pid):
    data = request.get_json()
    todo = Todos(
        job_id=pid, task=data.get('task', ''), assignee=data.get('assignee', ''),
        due_date=data.get('due_date', ''), priority=data.get('priority', 'medium'),
        done=data.get('done', False),
    )
    db.session.add(todo)
    db.session.commit()
    return jsonify(todo.to_dict()), 201


@app.route('/todos/<int:todo_id>', methods=['PUT'])
def update_todo(todo_id):
    todo = Todos.query.get_or_404(todo_id)
    data = request.get_json()
    for k in ('task', 'assignee', 'due_date', 'priority', 'done'):
        if k in data:
            setattr(todo, k, data[k])
    db.session.commit()
    return jsonify(todo.to_dict())


# ============================================================
# DOCUMENTS / PHOTOS / VIDEOS
# ============================================================

@app.route('/projects/<int:pid>/documents', methods=['GET'])
def get_documents(pid):
    media_type = request.args.get('type', None)
    q = Documents.query.filter_by(job_id=pid)
    if media_type:
        q = q.filter_by(media_type=media_type)
    docs = q.order_by(Documents.created_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])


@app.route('/projects/<int:pid>/documents', methods=['POST'])
def add_document(pid):
    data = request.get_json()
    doc = Documents(
        job_id=pid, name=data.get('name', ''), category=data.get('category', 'General'),
        media_type=data.get('media_type', 'document'),
        file_size=data.get('file_size', 0), uploaded_by=data.get('uploaded_by', ''),
        created_at=data.get('created_at', datetime.utcnow().strftime('%Y-%m-%d')),
    )
    db.session.add(doc)
    db.session.commit()
    return jsonify(doc.to_dict()), 201


# ============================================================
# RUN
# ============================================================

def _get_sql_type(col):
    """Convert SQLAlchemy column type to MySQL column definition"""
    from sqlalchemy import Integer, Float, String, Text, Boolean, DateTime
    ct = type(col.type)
    if ct == Integer:
        return 'INTEGER'
    elif ct == Float:
        return 'FLOAT'
    elif ct == String:
        length = col.type.length or 255
        return f'VARCHAR({length})'
    elif ct == Text:
        return 'TEXT'
    elif ct == Boolean:
        return 'TINYINT(1)'
    elif ct == DateTime:
        return 'DATETIME'
    else:
        return 'TEXT'


def _get_default(col):
    """Get DEFAULT clause for a column"""
    if col.default is not None:
        val = col.default.arg if hasattr(col.default, 'arg') else col.default
        if callable(val):
            return ''  # Can't set callable defaults in DDL
        if isinstance(val, bool):
            return f" DEFAULT {1 if val else 0}"
        elif isinstance(val, (int, float)):
            return f" DEFAULT {val}"
        elif isinstance(val, str):
            return f" DEFAULT '{val}'"
    if col.nullable is not False:
        return ' DEFAULT NULL'
    return ''


def auto_migrate():
    """Check all models against DB and add missing tables/columns automatically"""
    from sqlalchemy import inspect, text
    insp = inspect(db.engine)
    existing_tables = insp.get_table_names()

    # Get all model classes
    models = [cls for cls in db.Model.__subclasses__()]
    changes = []

    for model in models:
        table_name = model.__tablename__
        if table_name not in existing_tables:
            # create_all will handle new tables
            changes.append(f"CREATE TABLE {table_name}")
            continue

        # Check columns
        db_columns = {c['name']: c for c in insp.get_columns(table_name)}
        for attr_name, col_obj in model.__table__.columns.items():
            col_name = col_obj.name
            if col_name not in db_columns:
                sql_type = _get_sql_type(col_obj)
                default = _get_default(col_obj)
                null = '' if col_obj.nullable is not False else ' NOT NULL'
                # For NOT NULL without default, add a safe default
                if null == ' NOT NULL' and not default:
                    if 'INT' in sql_type or 'FLOAT' in sql_type or 'TINYINT' in sql_type:
                        default = ' DEFAULT 0'
                    else:
                        default = " DEFAULT ''"
                stmt = f"ALTER TABLE {table_name} ADD COLUMN {col_name} {sql_type}{null}{default}"
                try:
                    db.session.execute(text(stmt))
                    changes.append(f"ADD COLUMN {table_name}.{col_name} ({sql_type})")
                except Exception as e:
                    print(f"  ⚠ Failed: {stmt} — {e}")

    if changes:
        db.session.commit()

    # Now create any brand new tables
    db.create_all()

    if changes:
        print(f"✅ Database migration: {len(changes)} change(s)")
        for c in changes:
            print(f"   • {c}")
    else:
        print("✅ Database schema up to date — no changes needed")


if __name__ == "__main__":
    with app.app_context():
        auto_migrate()
    app.run(host='0.0.0.0', port=5000, debug=True)
