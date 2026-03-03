from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadData
import json
import os, uuid, base64

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*", "allow_headers": ["Content-Type", "Authorization"]}})


app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:auth_socket@localhost/liberty_homes'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'buildersync-dev-secret-change-in-production')

db = SQLAlchemy(app)
token_serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])

TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

def generate_token(user):
    """Generate a signed auth token for the given user."""
    return token_serializer.dumps({
        'user_id': user.id,
        'role': user.role,
        'company_id': user.company_id,
    })

@app.before_request
def require_auth():
    """Protect all routes except public ones."""
    # Public routes that don't require authentication
    if request.path in ('/login', '/register') and request.method == 'POST':
        return None
    if request.path.startswith('/uploads/'):
        return None
    # CORS preflight requests
    if request.method == 'OPTIONS':
        return None

    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Authentication required'}), 401

    token = auth_header[7:]
    try:
        data = token_serializer.loads(token, max_age=TOKEN_MAX_AGE)
        request.current_user = data
    except BadData:
        return jsonify({'error': 'Invalid or expired token'}), 401


# ============================================================
# MODELS
# ============================================================

class Company(db.Model):
    """Builder companies — the top-level tenant for data isolation."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, unique=True)
    status = db.Column(db.String(20), nullable=False, default='active')  # active | paused | deleted
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class LoginInfo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), unique=True, nullable=False)
    firstName = db.Column(db.String(30), nullable=False)
    lastName = db.Column(db.String(30), nullable=False)
    companyName = db.Column(db.String(120), nullable=False, default='')
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='builder')  # admin | company_admin | builder | contractor | customer
    phone = db.Column(db.String(30), default='')
    trades = db.Column(db.Text, default='')
    street_address = db.Column(db.String(200), default='')
    city = db.Column(db.String(100), default='')
    state = db.Column(db.String(2), default='')
    zip_code = db.Column(db.String(10), default='')
    active = db.Column(db.Boolean, default=True)
    theme_preference = db.Column(db.String(10), default='system')  # 'system' | 'dark' | 'light'
    company_logo = db.Column(db.Text, default='')  # base64 image data
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)  # NULL for admin
    authorized = db.Column(db.Boolean, default=True)
    registered = db.Column(db.Boolean, default=True)  # False = invited but hasn't completed registration
    is_project_manager = db.Column(db.Boolean, default=False)  # PM flag for builders

    def __init__(self, username, password, firstName, lastName, companyName='',
                 role='builder', phone='', trades='', street_address='', city='', state='', zip_code='',
                 company_id=None, authorized=True, registered=True):
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
        self.company_id = company_id
        self.authorized = authorized
        self.registered = registered

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
            'authorized': self.authorized if self.authorized is not None else True,
            'theme_preference': self.theme_preference or 'system',
            'has_logo': bool(self.company_logo),
            'company_id': self.company_id,
            'registered': self.registered if self.registered is not None else True,
            'is_project_manager': bool(self.is_project_manager) if self.is_project_manager is not None else False,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class GoLiveStep(db.Model):
    """Configurable steps that must be completed before a project can go live.
    Managed by company_admin. Each project tracks completion via GoLiveProjectStep."""
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'company_id': self.company_id, 'title': self.title, 'sort_order': self.sort_order}


class GoLiveProjectStep(db.Model):
    """Tracks which go-live steps have been completed for a specific project."""
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    step_id = db.Column(db.Integer, db.ForeignKey('go_live_step.id'), nullable=False)
    completed = db.Column(db.Boolean, default=False)
    completed_at = db.Column(db.DateTime, nullable=True)
    completed_by = db.Column(db.String(100), default='')

    def to_dict(self):
        return {
            'id': self.id, 'project_id': self.project_id, 'step_id': self.step_id,
            'completed': bool(self.completed), 'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'completed_by': self.completed_by or '',
        }


class Subdivision(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'company_id': self.company_id}


class SubdivisionContractor(db.Model):
    """Maps a trade to a specific contractor within a subdivision."""
    id = db.Column(db.Integer, primary_key=True)
    subdivision_id = db.Column(db.Integer, db.ForeignKey('subdivision.id'), nullable=False)
    trade = db.Column(db.String(100), nullable=False)
    contractor_id = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'subdivision_id': self.subdivision_id,
            'trade': self.trade,
            'contractor_id': self.contractor_id,
        }


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
    customer_first_name = db.Column(db.String(100), default='')
    customer_last_name = db.Column(db.String(100), default='')
    customer_phone = db.Column(db.String(30), default='')
    homeowner2_id = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=True)
    homeowner2_first_name = db.Column(db.String(100), default='')
    homeowner2_last_name = db.Column(db.String(100), default='')
    homeowner2_phone = db.Column(db.String(30), default='')
    homeowner2_email = db.Column(db.String(120), default='')
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
    hold_reason = db.Column(db.String(500), default='')
    permit_number = db.Column(db.String(100), default='')
    plan_name = db.Column(db.String(200), default='')
    selection_template_id = db.Column(db.Integer, db.ForeignKey('selection_template.id'), nullable=True)
    subdivision_id = db.Column(db.Integer, db.ForeignKey('subdivision.id'), nullable=True)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)
    project_manager_id = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=True)
    superintendent_id = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=True)
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
            'customer_name': f'{self.customer_first_name or ""} {self.customer_last_name or ""}'.strip(),
            'customer_first_name': self.customer_first_name or '',
            'customer_last_name': self.customer_last_name or '',
            'customer_phone': self.customer_phone or '',
            'homeowner2_id': self.homeowner2_id,
            'homeowner2_first_name': self.homeowner2_first_name or '',
            'homeowner2_last_name': self.homeowner2_last_name or '',
            'homeowner2_phone': self.homeowner2_phone or '',
            'homeowner2_email': self.homeowner2_email or '',
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
            'hold_reason': self.hold_reason or '',
            'permit_number': self.permit_number or '',
            'plan_name': self.plan_name or '',
            'selection_template_id': self.selection_template_id,
            'subdivision_id': self.subdivision_id,
            'company_id': self.company_id,
            'project_manager_id': self.project_manager_id,
            'superintendent_id': self.superintendent_id,
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
    sub_id = db.Column(db.Integer, nullable=True)
    sub_name = db.Column(db.String(200), nullable=True)
    sub_sig = db.Column(db.Boolean, default=False)
    sub_sig_date = db.Column(db.String(20), nullable=True)
    builder_sig_initials = db.Column(db.String(10), nullable=True)
    builder_sig_name = db.Column(db.String(200), nullable=True)
    customer_sig_initials = db.Column(db.String(10), nullable=True)
    customer_sig_name = db.Column(db.String(200), nullable=True)
    sub_sig_initials = db.Column(db.String(10), nullable=True)
    sub_sig_name = db.Column(db.String(200), nullable=True)
    task_id = db.Column(db.Integer, nullable=True)
    task_name = db.Column(db.String(200), nullable=True)
    task_extension_days = db.Column(db.Integer, default=0)
    created_at = db.Column(db.String(20), default='')
    due_date = db.Column(db.String(20), nullable=True)
    documents = db.relationship('ChangeOrderDocument', backref='change_order', cascade='all, delete-orphan', lazy=True)

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id, 'title': self.title,
            'description': self.description, 'amount': self.amount,
            'status': self.status, 'builder_sig': self.builder_sig,
            'builder_sig_date': self.builder_sig_date, 'customer_sig': self.customer_sig,
            'customer_sig_date': self.customer_sig_date,
            'sub_id': self.sub_id, 'sub_name': self.sub_name,
            'sub_sig': self.sub_sig, 'sub_sig_date': self.sub_sig_date,
            'builder_sig_initials': self.builder_sig_initials,
            'builder_sig_name': self.builder_sig_name,
            'customer_sig_initials': self.customer_sig_initials,
            'customer_sig_name': self.customer_sig_name,
            'sub_sig_initials': self.sub_sig_initials,
            'sub_sig_name': self.sub_sig_name,
            'task_id': self.task_id, 'task_name': self.task_name,
            'task_extension_days': self.task_extension_days,
            'created_at': self.created_at, 'due_date': self.due_date,
        }


class ChangeOrderDocument(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    change_order_id = db.Column(db.Integer, db.ForeignKey('change_orders.id'), nullable=False)
    name = db.Column(db.String(200), default='')
    description = db.Column(db.Text, default='')
    file_url = db.Column(db.String(500), default='')
    file_size = db.Column(db.Integer, default=0)
    uploaded_by = db.Column(db.String(100), default='')
    created_at = db.Column(db.String(20), default='')

    def to_dict(self):
        return {
            'id': self.id, 'change_order_id': self.change_order_id,
            'name': self.name, 'description': self.description,
            'file_url': self.file_url, 'file_size': self.file_size,
            'uploaded_by': self.uploaded_by, 'created_at': self.created_at,
        }


class SelectionItem(db.Model):
    """Selection catalog scoped to a company"""
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(100), default='')
    item = db.Column(db.String(200), default='')
    options = db.Column(db.Text, default='[]')  # JSON: [{name, image_path, price, comes_standard, price_tbd}]
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)
    allow_multiple = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id, 'category': self.category, 'item': self.item,
            'options': json.loads(self.options) if self.options else [],
            'allow_multiple': bool(self.allow_multiple),
        }


class ProjectSelection(db.Model):
    """Per-project selection choice made by customer"""
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    selection_item_id = db.Column(db.Integer, db.ForeignKey('selection_item.id'), nullable=False)
    selected = db.Column(db.Text, nullable=True)  # single option name OR JSON array for multi-select
    status = db.Column(db.String(30), default='pending')  # pending | confirmed
    price_override = db.Column(db.Float, nullable=True)  # builder sets this for Price TBD options
    customer_comment = db.Column(db.Text, nullable=True)  # customer note visible to builder

    def to_dict(self):
        item = SelectionItem.query.get(self.selection_item_id)
        d = item.to_dict() if item else {'id': self.selection_item_id, 'category': '', 'item': '', 'options': [], 'allow_multiple': False}
        d['project_selection_id'] = self.id
        d['job_id'] = self.job_id
        # Parse selected: try JSON array first, fall back to plain string
        sel = self.selected
        if sel and sel.startswith('['):
            try:
                sel = json.loads(sel)
            except (json.JSONDecodeError, ValueError):
                pass
        d['selected'] = sel
        d['status'] = self.status
        d['selection_item_id'] = self.selection_item_id
        d['price_override'] = self.price_override
        d['customer_comment'] = self.customer_comment
        return d


class SelectionTemplate(db.Model):
    """Reusable template defining which selection items apply to a project"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), default='')
    item_ids_json = db.Column(db.Text, default='[]')  # JSON array of SelectionItem IDs
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('login_info.id'), nullable=True)
    created_at = db.Column(db.String(30), default='')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name,
            'item_ids': json.loads(self.item_ids_json) if self.item_ids_json else [],
            'company_id': self.company_id,
            'created_by': self.created_by, 'created_at': self.created_at,
        }


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
    contractors_json = db.Column(db.Text, nullable=True)   # JSON array of contractor names
    trades_json = db.Column(db.Text, nullable=True)        # JSON array of trade names
    hidden_from_customer = db.Column(db.Boolean, default=False)
    predecessor_id = db.Column(db.Integer, nullable=True)
    rel_type = db.Column(db.String(5), default='FS')
    lag_days = db.Column(db.Integer, default=0)
    is_exception = db.Column(db.Boolean, default=False)
    exception_description = db.Column(db.Text, default='')

    def _get_contractors(self):
        """Return contractors as list. Falls back to legacy single contractor field."""
        if self.contractors_json:
            try:
                arr = json.loads(self.contractors_json)
                if arr:
                    return arr
            except (json.JSONDecodeError, TypeError):
                pass
        return [self.contractor] if self.contractor else []

    def _get_trades(self):
        """Return trades as list. Falls back to legacy single trade field."""
        if self.trades_json:
            try:
                arr = json.loads(self.trades_json)
                if arr:
                    return arr
            except (json.JSONDecodeError, TypeError):
                pass
        return [self.trade] if self.trade else []

    def to_dict(self):
        contractors = self._get_contractors()
        trades = self._get_trades()
        return {
            'id': self.id, 'job_id': self.job_id, 'task': self.task,
            'start_date': self.start_date, 'end_date': self.end_date,
            'baseline_start': self.baseline_start, 'baseline_end': self.baseline_end,
            'progress': self.progress,
            'contractor': contractors[0] if contractors else '',
            'contractors': contractors,
            'trade': trades[0] if trades else '',
            'trades': trades,
            'hidden_from_customer': bool(self.hidden_from_customer) if self.hidden_from_customer else False,
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
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)

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
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)

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
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'sqft': self.sqft,
            'stories': self.stories, 'bedrooms': self.bedrooms, 'bathrooms': self.bathrooms,
        }


class FloorPlan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), default='')
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name}


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


class ClientTask(db.Model):
    __tablename__ = 'client_task'
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default='')
    due_date = db.Column(db.String(20), default='')
    image_url = db.Column(db.String(500), default='')
    completed = db.Column(db.Boolean, default=False)
    completed_at = db.Column(db.String(30), default='')
    created_by = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.String(30), default='')
    linked_schedule_id = db.Column(db.Integer, nullable=True)  # FK to schedule.id
    linked_date_type = db.Column(db.String(10), nullable=True)  # 'start' or 'end'

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id, 'title': self.title,
            'description': self.description, 'due_date': self.due_date,
            'image_url': self.image_url or '',
            'completed': self.completed, 'completed_at': self.completed_at,
            'created_by': self.created_by, 'created_at': self.created_at,
            'linked_schedule_id': self.linked_schedule_id,
            'linked_date_type': self.linked_date_type or '',
        }


class Documents(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=True)
    subdivision_id = db.Column(db.Integer, db.ForeignKey('subdivision.id'), nullable=True)
    name = db.Column(db.String(200), default='')
    category = db.Column(db.String(100), default='General')
    media_type = db.Column(db.String(20), default='document')   # document | photo | video
    file_size = db.Column(db.Integer, default=0)
    uploaded_by = db.Column(db.String(100), default='')
    created_at = db.Column(db.String(20), default='')
    file_url = db.Column(db.String(500), default='')
    template_id = db.Column(db.Integer, nullable=True)

    def to_dict(self):
        return {
            'id': self.id, 'job_id': self.job_id,
            'subdivision_id': self.subdivision_id,
            'name': self.name, 'category': self.category,
            'media_type': self.media_type, 'file_size': self.file_size,
            'uploaded_by': self.uploaded_by, 'created_at': self.created_at,
            'file_url': self.file_url, 'template_id': self.template_id,
        }


class DocumentTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    doc_type = db.Column(db.String(20), default='file')  # file | folder
    applies_to = db.Column(db.String(20), default='both')  # projects | subdivisions | both
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'doc_type': self.doc_type,
            'applies_to': self.applies_to or 'both',
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


def _apply_hold_preview(task_dicts, hold_start_date):
    """Adjust task dates in-memory to preview hold extension (no DB writes).
    Mirrors the release logic: extend in-progress task and push subsequent tasks."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    hold_start = _to_date(hold_start_date)
    if not hold_start:
        return task_dicts

    # Calculate workdays on hold so far
    hold_days = 0
    d = hold_start
    while d < today:
        d += timedelta(days=1)
        if d.weekday() < 5:
            hold_days += 1
    if hold_days < 1:
        return task_dicts  # same day, no adjustment needed yet

    today_str = _fmt(today)

    # Find in-progress task: started but not complete, not exception
    in_progress = None
    for t in task_dicts:
        sd = t.get('start_date', '')
        prog = t.get('progress', 0)
        is_exc = t.get('is_exception', False)
        if sd and sd <= today_str and prog < 100 and not is_exc:
            if not in_progress or sd > in_progress.get('start_date', ''):
                in_progress = t

    if in_progress:
        # Extend in-progress task end_date
        old_end = _to_date(in_progress.get('end_date'))
        if old_end:
            in_progress['end_date'] = _fmt(_add_workdays(old_end, hold_days))

        # Push all tasks after the in-progress task
        ip_start = in_progress.get('start_date', '')
        for t in task_dicts:
            if t.get('id') == in_progress.get('id'):
                continue
            if t.get('start_date', '') and t['start_date'] > ip_start:
                old_s = _to_date(t['start_date'])
                old_e = _to_date(t.get('end_date'))
                if old_s:
                    t['start_date'] = _fmt(_add_workdays(old_s, hold_days))
                if old_e:
                    t['end_date'] = _fmt(_add_workdays(old_e, hold_days))
    else:
        # No in-progress task — push all future tasks
        for t in task_dicts:
            if t.get('start_date', '') and t['start_date'] >= today_str:
                old_s = _to_date(t['start_date'])
                old_e = _to_date(t.get('end_date'))
                if old_s:
                    t['start_date'] = _fmt(_add_workdays(old_s, hold_days))
                if old_e:
                    t['end_date'] = _fmt(_add_workdays(old_e, hold_days))

    return task_dicts


# ============================================================
# ADMIN HELPER
# ============================================================

def _require_admin():
    """Return the admin user or abort with 403."""
    uid = request.args.get('admin_id', type=int) or (request.get_json() or {}).get('admin_id')
    if not uid:
        return None
    user = LoginInfo.query.get(uid)
    if not user or user.role != 'admin':
        return None
    return user


def _is_builder(role):
    """Return True if the role has builder-level access (builder or company_admin)."""
    return role in ('builder', 'company_admin')


# ============================================================
# SUPREME ADMIN ROUTES
# ============================================================

@app.route('/admin/stats', methods=['GET'])
def admin_stats():
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    total_companies = Company.query.filter(Company.status != 'deleted').count()
    active_companies = Company.query.filter_by(status='active').count()
    paused_companies = Company.query.filter_by(status='paused').count()
    total_users = LoginInfo.query.filter(LoginInfo.role != 'admin').count()
    total_builders = LoginInfo.query.filter(LoginInfo.role.in_(['builder', 'company_admin'])).count()
    total_contractors = LoginInfo.query.filter_by(role='contractor').count()
    total_customers = LoginInfo.query.filter_by(role='customer').count()
    total_projects = Projects.query.count()
    pending_users = LoginInfo.query.filter_by(authorized=False).count()
    return jsonify({
        'total_companies': total_companies,
        'active_companies': active_companies,
        'paused_companies': paused_companies,
        'total_users': total_users,
        'total_builders': total_builders,
        'total_contractors': total_contractors,
        'total_customers': total_customers,
        'total_projects': total_projects,
        'pending_users': pending_users,
    })


@app.route('/admin/companies', methods=['GET'])
def admin_list_companies():
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    companies = Company.query.filter(Company.status != 'deleted').order_by(Company.name).all()
    result = []
    for c in companies:
        user_count = LoginInfo.query.filter_by(company_id=c.id).filter(LoginInfo.role != 'admin').count()
        project_count = Projects.query.filter_by(company_id=c.id).count()
        d = c.to_dict()
        d['user_count'] = user_count
        d['project_count'] = project_count
        result.append(d)
    return jsonify(result)


@app.route('/admin/companies', methods=['POST'])
def admin_create_company():
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Company name is required'}), 400
    if Company.query.filter(db.func.lower(Company.name) == name.lower()).first():
        return jsonify({'error': 'A company with this name already exists'}), 409
    c = Company(name=name)
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201


@app.route('/admin/companies/<int:cid>', methods=['PUT'])
def admin_update_company(cid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    c = Company.query.get_or_404(cid)
    data = request.get_json()
    if 'name' in data:
        new_name = data['name'].strip()
        if new_name:
            existing = Company.query.filter(db.func.lower(Company.name) == new_name.lower(), Company.id != cid).first()
            if existing:
                return jsonify({'error': 'A company with this name already exists'}), 409
            c.name = new_name
    db.session.commit()
    return jsonify(c.to_dict())


@app.route('/admin/companies/<int:cid>/pause', methods=['PUT'])
def admin_pause_company(cid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    c = Company.query.get_or_404(cid)
    c.status = 'paused'
    db.session.commit()
    return jsonify(c.to_dict())


@app.route('/admin/companies/<int:cid>/activate', methods=['PUT'])
def admin_activate_company(cid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    c = Company.query.get_or_404(cid)
    c.status = 'active'
    db.session.commit()
    return jsonify(c.to_dict())


@app.route('/admin/companies/<int:cid>', methods=['DELETE'])
def admin_delete_company(cid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    c = Company.query.get_or_404(cid)
    c.status = 'deleted'
    # Deactivate all users in this company
    LoginInfo.query.filter_by(company_id=cid).update({'active': False})
    db.session.commit()
    return jsonify({'message': f'Company "{c.name}" deleted and all users deactivated'})


@app.route('/admin/companies/<int:cid>/users', methods=['GET'])
def admin_company_users(cid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    users = LoginInfo.query.filter_by(company_id=cid).order_by(LoginInfo.lastName).all()
    return jsonify([u.to_dict() for u in users])


@app.route('/admin/users/pending', methods=['GET'])
def admin_pending_users():
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    users = LoginInfo.query.filter_by(authorized=False).order_by(LoginInfo.created_at.desc()).all()
    result = []
    for u in users:
        d = u.to_dict()
        if u.company_id:
            company = Company.query.get(u.company_id)
            d['company_name_resolved'] = company.name if company else ''
        result.append(d)
    return jsonify(result)


@app.route('/admin/users/<int:uid>/authorize', methods=['PUT'])
def admin_authorize_user(uid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    user = LoginInfo.query.get_or_404(uid)
    user.authorized = True
    db.session.commit()
    return jsonify(user.to_dict())


@app.route('/admin/users/<int:uid>/reject', methods=['PUT'])
def admin_reject_user(uid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    user = LoginInfo.query.get_or_404(uid)
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'User rejected and deleted'})


@app.route('/admin/companies/<int:cid>/invite', methods=['POST'])
def admin_invite_user(cid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json()
    email = (data.get('email') or '').lower().strip()
    role = data.get('role', 'builder')
    if not email or '@' not in email:
        return jsonify({'error': 'Valid email is required'}), 400
    if role not in ('company_admin', 'builder', 'contractor', 'customer'):
        return jsonify({'error': 'Invalid role'}), 400
    company = Company.query.get_or_404(cid)
    existing = LoginInfo.query.filter_by(username=email).first()
    if existing:
        return jsonify({'error': 'This email is already in the system'}), 409
    invited = LoginInfo(
        username=email,
        password='INVITED_PLACEHOLDER',  # will be overwritten on registration
        firstName='',
        lastName='',
        role=role,
        company_id=company.id,
        companyName=company.name,
        authorized=True,
        registered=False,
    )
    db.session.add(invited)
    db.session.commit()
    return jsonify(invited.to_dict()), 201


@app.route('/admin/companies/<int:cid>/invited/<int:uid>', methods=['DELETE'])
def admin_remove_invited(cid, uid):
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    user = LoginInfo.query.get_or_404(uid)
    if user.company_id != cid:
        return jsonify({'error': 'User not in this company'}), 400
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'User removed'})


@app.route('/admin/reset-database', methods=['POST'])
def admin_reset_database():
    admin = _require_admin()
    if not admin:
        return jsonify({'error': 'Unauthorized'}), 403
    try:
        from sqlalchemy import text
        # Disable FK checks so we can delete in any order
        db.session.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        tables_to_clear = [
            'change_order_document', 'change_orders', 'documents', 'document_template',
            'daily_log', 'punch', 'todo', 'selection_item', 'project_selection',
            'schedule', 'projects', 'subdivision',
        ]
        for table in tables_to_clear:
            try:
                db.session.execute(text(f"DELETE FROM {table}"))
            except Exception as e:
                print(f"  Could not clear {table}: {e}")
        # Delete all non-admin users
        db.session.execute(text("DELETE FROM login_info WHERE role != 'admin'"))
        # Delete all companies
        db.session.execute(text("DELETE FROM company"))
        # Re-enable FK checks
        db.session.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        db.session.commit()
        return jsonify({'message': 'Database cleared successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ============================================================
# COMPANY ADMIN ROUTES
# ============================================================

@app.route('/company/invite', methods=['POST'])
def company_admin_invite():
    """Company admins can invite users (builders, contractors, customers) to their own company."""
    data = request.get_json()
    uid = data.get('user_id')
    if not uid:
        return jsonify({'error': 'Missing user_id'}), 400
    requester = LoginInfo.query.get(uid)
    if not requester or requester.role != 'company_admin':
        return jsonify({'error': 'Only company admins can invite users'}), 403
    if not requester.company_id:
        return jsonify({'error': 'You are not assigned to a company'}), 400

    email = (data.get('email') or '').lower().strip()
    role = data.get('role', 'builder')
    if not email or '@' not in email:
        return jsonify({'error': 'Valid email is required'}), 400
    if role not in ('builder', 'contractor', 'customer'):
        return jsonify({'error': 'Invalid role. Company admins can invite builders, contractors, and customers.'}), 400

    company = Company.query.get(requester.company_id)
    if not company:
        return jsonify({'error': 'Company not found'}), 404

    existing = LoginInfo.query.filter_by(username=email).first()
    if existing:
        return jsonify({'error': 'This email is already in the system'}), 409

    invited = LoginInfo(
        username=email,
        password='INVITED_PLACEHOLDER',
        firstName='',
        lastName='',
        role=role,
        company_id=company.id,
        companyName=company.name,
        authorized=True,
        registered=False,
    )
    db.session.add(invited)
    db.session.commit()
    return jsonify(invited.to_dict()), 201


@app.route('/company/users', methods=['GET'])
def company_admin_list_users():
    """Company admins can list users in their own company."""
    uid = request.args.get('user_id', type=int)
    if not uid:
        return jsonify({'error': 'Missing user_id'}), 400
    requester = LoginInfo.query.get(uid)
    if not requester or requester.role != 'company_admin':
        return jsonify({'error': 'Only company admins can view company users'}), 403
    if not requester.company_id:
        return jsonify({'error': 'You are not assigned to a company'}), 400

    users = LoginInfo.query.filter_by(company_id=requester.company_id).all()
    return jsonify([u.to_dict() for u in users])


@app.route('/company/users/<int:uid>', methods=['DELETE'])
def company_admin_remove_user(uid):
    """Company admins can remove users from their company."""
    requester_id = request.args.get('user_id', type=int) or (request.get_json() or {}).get('user_id')
    if not requester_id:
        return jsonify({'error': 'Missing user_id'}), 400
    requester = LoginInfo.query.get(requester_id)
    if not requester or requester.role != 'company_admin':
        return jsonify({'error': 'Only company admins can remove users'}), 403
    target = LoginInfo.query.get_or_404(uid)
    if target.company_id != requester.company_id:
        return jsonify({'error': 'User is not in your company'}), 400
    if target.id == requester.id:
        return jsonify({'error': 'You cannot remove yourself'}), 400
    db.session.delete(target)
    db.session.commit()
    return jsonify({'message': 'User removed'})


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

        email = data['username'].lower().strip()
        existing = LoginInfo.query.filter_by(username=email).first()

        if not existing:
            return jsonify({'error': 'This email has not been invited. Please contact your administrator.'}), 403

        if existing.registered:
            return jsonify({'error': 'This email is already registered. Please log in instead.'}), 409

        # Complete registration for invited user
        existing.password = generate_password_hash(data['password'])
        existing.firstName = data['firstName']
        existing.lastName = data['lastName']
        existing.phone = data.get('phone', '')
        existing.trades = data.get('trades', '')
        existing.registered = True
        db.session.commit()
        return jsonify({'message': 'Registration complete! Please log in.', 'user': existing.to_dict()}), 201
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
        if not user.registered:
            return jsonify({'error': 'Please complete your registration first.'}), 403
        if not check_password_hash(user.password, data['password']):
            return jsonify({'error': 'Invalid email or password'}), 401

        # Check authorization (admin is always authorized)
        if user.role != 'admin' and user.authorized is not None and not user.authorized:
            return jsonify({'error': 'Account pending approval. Please contact your administrator.'}), 403

        # Check company status (admin has no company)
        if user.role != 'admin' and user.company_id:
            company = Company.query.get(user.company_id)
            if company and company.status == 'paused':
                return jsonify({'error': 'Your company account has been suspended. Please contact the administrator.'}), 403
            if company and company.status == 'deleted':
                return jsonify({'error': 'Your company account has been removed. Please contact the administrator.'}), 403

        token = generate_token(user)
        return jsonify({'message': 'Login successful', 'user': user.to_dict(), 'token': token}), 200
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
    """Set or update a user's company logo (company_admin only)."""
    u = LoginInfo.query.get_or_404(uid)
    if u.role != 'company_admin':
        return jsonify({'error': 'Only company admins can change the company logo'}), 403
    data = request.get_json()
    u.company_logo = data.get('logo', '')
    db.session.commit()
    return jsonify({'message': 'Logo updated', 'has_logo': bool(u.company_logo)})


@app.route('/builder-logo', methods=['GET'])
def get_builder_logo():
    """Get any builder's logo for company branding.
    Searches all builders for one with a logo uploaded."""
    builders = LoginInfo.query.filter(LoginInfo.role.in_(['builder', 'company_admin'])).all()
    for b in builders:
        if b.company_logo:
            return jsonify({'logo': b.company_logo})
    return jsonify({'logo': ''})


# ============================================================
# USER MANAGEMENT ROUTES (builder only)
# ============================================================

@app.route('/users', methods=['GET'])
def get_all_users():
    company_id = request.args.get('company_id', type=int)
    if company_id:
        users = LoginInfo.query.filter_by(company_id=company_id).all()
    else:
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

        # --- Duplicate subcontractor check (company + first + last name) ---
        co = (data.get('companyName') or '').strip().lower()
        fn = data['firstName'].strip().lower()
        ln = data['lastName'].strip().lower()
        if co:
            dup_user = LoginInfo.query.filter(
                db.func.lower(LoginInfo.companyName) == co,
                db.func.lower(LoginInfo.firstName) == fn,
                db.func.lower(LoginInfo.lastName) == ln,
            ).first()
            if dup_user:
                return jsonify({'error': f'A user named "{dup_user.firstName} {dup_user.lastName}" at "{dup_user.companyName}" already exists'}), 409

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
            company_id=data.get('company_id'),
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


@app.route('/users/<int:user_id>/project-manager', methods=['PUT'])
def toggle_project_manager(user_id):
    """Toggle is_project_manager flag for a builder."""
    user = LoginInfo.query.get_or_404(user_id)
    data = request.get_json() or {}
    if 'is_project_manager' in data:
        user.is_project_manager = bool(data['is_project_manager'])
    else:
        user.is_project_manager = not (user.is_project_manager or False)
    db.session.commit()
    return jsonify(user.to_dict())


@app.route('/company/<int:cid>/builders', methods=['GET'])
def get_company_builders(cid):
    """Get all builders/company_admins in a company (for PM/superintendent dropdowns)."""
    builders = LoginInfo.query.filter(
        LoginInfo.company_id == cid,
        LoginInfo.role.in_(['builder', 'company_admin']),
        LoginInfo.active == True,
    ).all()
    return jsonify([b.to_dict() for b in builders])


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


@app.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Get a single user by ID."""
    user = LoginInfo.query.get_or_404(user_id)
    return jsonify(user.to_dict())


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
        # Sync trades across all builders in the same company
        if _is_builder(user.role) and user.companyName:
            company_builders = LoginInfo.query.filter(
                LoginInfo.role.in_(['builder', 'company_admin']),
                db.func.lower(LoginInfo.companyName) == user.companyName.lower(),
                LoginInfo.id != user.id,
            ).all()
            for b in company_builders:
                b.trades = data['trades']
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


@app.route('/users/<int:user_id>/company-trades', methods=['GET'])
def get_company_trades(user_id):
    """Get the shared trades list for the builder's company."""
    user = LoginInfo.query.get_or_404(user_id)
    if not _is_builder(user.role):
        return jsonify({'trades': user.trades or ''}), 200
    # Find any builder in the same company that has trades set
    if user.trades and user.trades.strip():
        return jsonify({'trades': user.trades}), 200
    if user.companyName:
        peer = LoginInfo.query.filter(
            LoginInfo.role.in_(['builder', 'company_admin']),
            db.func.lower(LoginInfo.companyName) == user.companyName.lower(),
            LoginInfo.trades != '',
            LoginInfo.trades.isnot(None),
        ).first()
        if peer:
            # Sync to this user so they stay up to date
            user.trades = peer.trades
            db.session.commit()
            return jsonify({'trades': peer.trades}), 200
    return jsonify({'trades': ''}), 200


# ============================================================
# PROJECTS ROUTES
# ============================================================

# ============================================================
# SUBDIVISIONS
# ============================================================

@app.route('/subdivisions', methods=['GET'])
def get_subdivisions():
    company_id = request.args.get('company_id', type=int)
    q = Subdivision.query.order_by(Subdivision.name)
    if company_id:
        q = q.filter_by(company_id=company_id)
    subs = q.all()
    return jsonify([s.to_dict() for s in subs])

@app.route('/subdivisions', methods=['POST'])
def create_subdivision():
    data = request.get_json()
    name = (data or {}).get('name', '').strip()
    if not name:
        return jsonify({'error': 'Subdivision name required'}), 400
    s = Subdivision(name=name)
    # Set company_id from the creating user
    user_id = (data or {}).get('user_id')
    if user_id:
        creator = LoginInfo.query.get(user_id)
        if creator and creator.company_id:
            s.company_id = creator.company_id
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
    SubdivisionContractor.query.filter_by(subdivision_id=sid).delete()
    db.session.delete(s)
    db.session.commit()
    return jsonify({'deleted': True})


# --- Subdivision Contractor Assignments (trade -> contractor per subdivision) ---

@app.route('/subdivisions/<int:sid>/contractors', methods=['GET'])
def get_subdivision_contractors(sid):
    """Get all trade->contractor assignments for a subdivision."""
    rows = SubdivisionContractor.query.filter_by(subdivision_id=sid).all()
    result = []
    for r in rows:
        d = r.to_dict()
        u = LoginInfo.query.get(r.contractor_id)
        if u:
            d['contractor'] = u.to_dict()
        result.append(d)
    return jsonify(result)


@app.route('/subdivisions/<int:sid>/contractors', methods=['PUT'])
def set_subdivision_contractor(sid):
    """Set or update the contractor for a trade in a subdivision."""
    data = request.get_json()
    trade = data.get('trade', '').strip()
    contractor_id = data.get('contractor_id')
    if not trade or not contractor_id:
        return jsonify({'error': 'trade and contractor_id required'}), 400

    existing = SubdivisionContractor.query.filter_by(
        subdivision_id=sid, trade=trade).first()
    if existing:
        existing.contractor_id = contractor_id
    else:
        existing = SubdivisionContractor(
            subdivision_id=sid, trade=trade, contractor_id=contractor_id)
        db.session.add(existing)
    db.session.commit()
    d = existing.to_dict()
    u = LoginInfo.query.get(contractor_id)
    if u:
        d['contractor'] = u.to_dict()
    return jsonify(d)


@app.route('/subdivisions/<int:sid>/contractors/<trade>', methods=['DELETE'])
def remove_subdivision_contractor(sid, trade):
    """Remove the contractor assignment for a trade in a subdivision."""
    row = SubdivisionContractor.query.filter_by(
        subdivision_id=sid, trade=trade).first()
    if row:
        db.session.delete(row)
        db.session.commit()
    return jsonify({'deleted': True})


def apply_subdivision_contractors(project_id):
    """Auto-assign subdivision contractors to a project's schedule tasks.
    For each task with a trade that matches a subdivision contractor assignment,
    set the contractor name and ensure the contractor is added to the project."""
    proj = Projects.query.get(project_id)
    if not proj or not proj.subdivision_id:
        return
    assignments = SubdivisionContractor.query.filter_by(
        subdivision_id=proj.subdivision_id).all()
    if not assignments:
        return
    # Build trade -> contractor lookup
    trade_map = {}
    for a in assignments:
        u = LoginInfo.query.get(a.contractor_id)
        if u:
            name = u.companyName or f'{u.firstName} {u.lastName}'.strip()
            trade_map[a.trade.lower()] = (a.contractor_id, name)
    if not trade_map:
        return
    # Update schedule tasks (skip completed tasks — their contractor is locked)
    tasks = Schedule.query.filter_by(job_id=project_id).all()
    assigned_ids = set()
    for t in tasks:
        if t.progress == 100:
            continue
        # Check all trades (multi-trade support)
        task_trades = t._get_trades()
        if not task_trades and t.trade:
            task_trades = [t.trade]
        for tt in task_trades:
            if tt and tt.lower() in trade_map:
                cid, cname = trade_map[tt.lower()]
                t.contractor = cname
                assigned_ids.add(cid)
                break  # assign from first matching trade
    # Ensure contractors are in JobUsers for this project
    existing_user_ids = {ju.user_id for ju in JobUsers.query.filter_by(job_id=project_id).all()}
    for cid in assigned_ids:
        if cid not in existing_user_ids:
            db.session.add(JobUsers(job_id=project_id, user_id=cid, role='contractor'))
    db.session.commit()


@app.route('/projects', methods=['GET'])
def get_projects():
    """Get projects. Optional ?user_id=X&role=Y to filter by role."""
    user_id = request.args.get('user_id', type=int)
    role = request.args.get('role', '')

    # Resolve the requesting user's company_id for scoping
    req_user = LoginInfo.query.get(user_id) if user_id else None
    company_id = req_user.company_id if req_user else None

    if not user_id or _is_builder(role):
        # Company admins see ALL company projects
        # Regular builders see only projects assigned to them as PM or superintendent
        if req_user and req_user.role == 'company_admin':
            q = Projects.query
            if company_id:
                q = q.filter_by(company_id=company_id)
            projects = q.all()
        elif req_user and _is_builder(req_user.role):
            q = Projects.query
            if company_id:
                q = q.filter_by(company_id=company_id)
            all_company = q.all()
            # Filter to projects where this builder is PM or superintendent
            # Include projects with no PM/superintendent assigned (legacy projects)
            projects = [p for p in all_company
                        if p.project_manager_id == user_id
                        or p.superintendent_id == user_id
                        or (not p.project_manager_id and not p.superintendent_id)]
        else:
            q = Projects.query
            if company_id:
                q = q.filter_by(company_id=company_id)
            projects = q.all()
    elif role == 'customer':
        projects = Projects.query.filter(
            db.or_(Projects.customer_id == user_id, Projects.homeowner2_id == user_id)
        ).all()
    else:
        # Contractors: see projects they are assigned to
        job_ids = [ju.job_id for ju in JobUsers.query.filter_by(user_id=user_id).all()]
        projects = Projects.query.filter(Projects.id.in_(job_ids)).all() if job_ids else []

    result = []
    for p in projects:
        # Non-builders only see go_live projects
        if role and not _is_builder(role) and not p.go_live:
            continue
        d = p.to_dict()
        if p.customer_id:
            cust = LoginInfo.query.get(p.customer_id)
            if cust:
                d['customer_name'] = f'{cust.firstName} {cust.lastName}'.strip()
                d['customer_first_name'] = cust.firstName or ''
                d['customer_last_name'] = cust.lastName or ''
        # Enrich with PM and superintendent names
        if p.project_manager_id:
            pm = LoginInfo.query.get(p.project_manager_id)
            if pm:
                d['project_manager_name'] = f'{pm.firstName} {pm.lastName}'.strip()
        if p.superintendent_id:
            sup = LoginInfo.query.get(p.superintendent_id)
            if sup:
                d['superintendent_name'] = f'{sup.firstName} {sup.lastName}'.strip()
        result.append(d)
    return jsonify(result)


@app.route('/reports/spec', methods=['GET'])
def spec_report():
    """Return spec projects (no customer name) with current task and end date."""
    company_id = request.args.get('company_id', type=int)
    q = Projects.query
    if company_id:
        q = q.filter_by(company_id=company_id)
    projects = q.all()

    rows = []
    for p in projects:
        # Spec = no customer first+last name
        name = f'{p.customer_first_name or ""} {p.customer_last_name or ""}'.strip()
        if name:
            continue

        # Look up subdivision name
        sub_name = ''
        if p.subdivision_id:
            sd = Subdivision.query.get(p.subdivision_id)
            if sd:
                sub_name = sd.name

        # Get schedule tasks for current task and end date
        tasks = Schedule.query.filter_by(job_id=p.id).order_by(Schedule.start_date).all()
        current_task = ''
        job_end_date = ''
        for t in tasks:
            if t.end_date and t.end_date > job_end_date:
                job_end_date = t.end_date
            if t.progress < 100 and not current_task:
                current_task = t.task

        address = p.street_address or p.address or ''

        rows.append({
            'id': p.id,
            'subdivision': sub_name,
            'address': address,
            'plan_name': p.plan_name or '',
            'current_task': current_task,
            'end_date': job_end_date,
        })

    return jsonify(rows)


@app.route('/projects', methods=['POST'])
def add_project():
    try:
        data = request.get_json()
        if not data or not data.get('name'):
            return jsonify({'error': 'Project name required'}), 400

        # --- Duplicate project check (name + street address) ---
        proj_name = data['name'].strip().lower()
        proj_street = (data.get('street_address') or '').strip().lower()
        dup_query = Projects.query.filter(db.func.lower(Projects.name) == proj_name)
        if proj_street:
            dup_query = dup_query.filter(db.func.lower(Projects.street_address) == proj_street)
        existing_proj = dup_query.first()
        if existing_proj:
            return jsonify({'error': f'A project named "{existing_proj.name}" already exists at this address'}), 409

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

        # --- Auto-create second homeowner user if email provided ---
        homeowner2_id = None
        h2_email = data.get('homeowner2_email', '').strip().lower()
        h2_first = data.get('homeowner2_first_name', '').strip()
        h2_last = data.get('homeowner2_last_name', '').strip()

        if h2_email:
            existing_h2 = LoginInfo.query.filter_by(username=h2_email).first()
            if existing_h2:
                homeowner2_id = existing_h2.id
            else:
                new_h2 = LoginInfo(
                    username=h2_email,
                    password='Liberty',
                    firstName=h2_first or 'Homeowner',
                    lastName=h2_last or '2',
                    companyName='',
                    role='customer',
                    phone=data.get('homeowner2_phone', ''),
                )
                db.session.add(new_h2)
                db.session.flush()
                homeowner2_id = new_h2.id

        p = Projects()
        for key in ('name', 'address', 'street_address', 'city', 'state', 'zip_code',
                     'status', 'phase',
                     'start_date', 'est_completion', 'progress', 'original_price',
                     'contract_price', 'sqft', 'bedrooms', 'bathrooms', 'garage',
                     'lot_size', 'style', 'stories', 'email', 'dates_from_schedule', 'go_live', 'subdivision_id',
                     'permit_number', 'customer_first_name', 'customer_last_name', 'selection_template_id',
                     'homeowner2_first_name', 'homeowner2_last_name', 'homeowner2_phone', 'homeowner2_email',
                     'project_manager_id', 'superintendent_id'):
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
        p.homeowner2_id = homeowner2_id
        # Set company_id from the creating user
        creator_id = data.get('created_by') or data.get('user_id')
        if creator_id:
            creator = LoginInfo.query.get(creator_id)
            if creator and creator.company_id:
                p.company_id = creator.company_id
                # Also assign customers to the same company if newly created
                for cid in [customer_id, homeowner2_id]:
                    if cid:
                        cust = LoginInfo.query.get(cid)
                        if cust and not cust.company_id:
                            cust.company_id = creator.company_id
        db.session.add(p)
        db.session.commit()

        # Auto-assign subdivision contractors to any existing schedule tasks
        if p.subdivision_id:
            apply_subdivision_contractors(p.id)

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

    # Detect subdivision change (for auto-assigning contractors)
    old_subdivision_id = p.subdivision_id
    new_subdivision_id = data.get('subdivision_id')
    subdivision_changed = ('subdivision_id' in data and new_subdivision_id != old_subdivision_id
                           and new_subdivision_id is not None)

    for key in ('name', 'number', 'address', 'street_address', 'city', 'state', 'zip_code',
                 'status', 'phase', 'customer_id', 'customer_first_name', 'customer_last_name',
                 'customer_phone', 'homeowner2_id', 'homeowner2_first_name', 'homeowner2_last_name',
                 'homeowner2_phone', 'homeowner2_email',
                 'start_date', 'est_completion', 'progress', 'original_price',
                 'contract_price', 'sqft', 'bedrooms', 'bathrooms', 'garage',
                 'lot_size', 'style', 'stories', 'email', 'reconciliation', 'dates_from_schedule', 'go_live', 'subdivision_id',
                 'permit_number', 'plan_name', 'selection_template_id',
                 'project_manager_id', 'superintendent_id'):
        if key in data:
            # Prevent un-toggling go_live once it's been set
            if key == 'go_live' and p.go_live and not data[key]:
                continue
            setattr(p, key, data[key])

    # Sync customer name changes to the linked LoginInfo user
    if p.customer_id and ('customer_first_name' in data or 'customer_last_name' in data):
        cust = LoginInfo.query.get(p.customer_id)
        if cust:
            if 'customer_first_name' in data:
                cust.firstName = data['customer_first_name']
            if 'customer_last_name' in data:
                cust.lastName = data['customer_last_name']

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

    # Auto-assign subdivision contractors when project is added to a subdivision
    if subdivision_changed:
        apply_subdivision_contractors(project_id)

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
        hold_reason = data.get('hold_reason', '')
        if not hold_reason or not hold_reason.strip():
            return jsonify({'error': 'A reason is required to put a project on hold'}), 400
        today_str = _fmt(datetime.utcnow())
        p.on_hold = True
        p.hold_start_date = today_str
        p.hold_reason = hold_reason.strip()
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
        p.hold_reason = ''
        db.session.commit()
        sync_project_dates(project_id)

        # Return updated schedule with project
        all_tasks = Schedule.query.filter_by(job_id=project_id).order_by(Schedule.start_date).all()
        sync_linked_client_tasks([t.id for t in all_tasks])
        return jsonify({'project': p.to_dict(), 'schedule': [t.to_dict() for t in all_tasks]})

    return jsonify({'error': 'Action must be "hold" or "release"'}), 400


# ============================================================
# GO LIVE STEPS (company-level step templates)
# ============================================================

@app.route('/go-live-steps', methods=['GET'])
def get_go_live_steps():
    """List go-live steps for a company."""
    cid = request.args.get('company_id', type=int)
    if not cid:
        return jsonify([])
    steps = GoLiveStep.query.filter_by(company_id=cid).order_by(GoLiveStep.sort_order, GoLiveStep.id).all()
    return jsonify([s.to_dict() for s in steps])


@app.route('/go-live-steps', methods=['POST'])
def create_go_live_step():
    data = request.get_json() or {}
    if not data.get('title') or not data.get('company_id'):
        return jsonify({'error': 'title and company_id required'}), 400
    max_order = db.session.query(db.func.max(GoLiveStep.sort_order)).filter_by(company_id=data['company_id']).scalar() or 0
    step = GoLiveStep(company_id=data['company_id'], title=data['title'], sort_order=max_order + 1)
    db.session.add(step)
    db.session.commit()
    return jsonify(step.to_dict()), 201


@app.route('/go-live-steps/<int:step_id>', methods=['PUT'])
def update_go_live_step(step_id):
    step = GoLiveStep.query.get_or_404(step_id)
    data = request.get_json() or {}
    if 'title' in data:
        step.title = data['title']
    if 'sort_order' in data:
        step.sort_order = data['sort_order']
    db.session.commit()
    return jsonify(step.to_dict())


@app.route('/go-live-steps/<int:step_id>', methods=['DELETE'])
def delete_go_live_step(step_id):
    step = GoLiveStep.query.get_or_404(step_id)
    # Also delete project completions for this step
    GoLiveProjectStep.query.filter_by(step_id=step_id).delete()
    db.session.delete(step)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


# ============================================================
# GO LIVE PROJECT STEPS (per-project completion tracking)
# ============================================================

@app.route('/projects/<int:project_id>/go-live-steps', methods=['GET'])
def get_project_go_live_steps(project_id):
    """Get all go-live steps for a project, with completion status."""
    p = Projects.query.get_or_404(project_id)
    cid = p.company_id
    if not cid:
        return jsonify([])
    steps = GoLiveStep.query.filter_by(company_id=cid).order_by(GoLiveStep.sort_order, GoLiveStep.id).all()
    completions = {ps.step_id: ps for ps in GoLiveProjectStep.query.filter_by(project_id=project_id).all()}
    result = []
    for s in steps:
        ps = completions.get(s.id)
        result.append({
            **s.to_dict(),
            'completed': bool(ps and ps.completed),
            'completed_at': ps.completed_at.isoformat() if ps and ps.completed_at else None,
            'completed_by': ps.completed_by if ps else '',
        })
    return jsonify(result)


@app.route('/projects/<int:project_id>/go-live-steps/<int:step_id>', methods=['PUT'])
def toggle_project_go_live_step(project_id, step_id):
    """Toggle completion of a go-live step for a project."""
    data = request.get_json() or {}
    completed = data.get('completed', False)
    ps = GoLiveProjectStep.query.filter_by(project_id=project_id, step_id=step_id).first()
    if not ps:
        ps = GoLiveProjectStep(project_id=project_id, step_id=step_id)
        db.session.add(ps)
    ps.completed = completed
    ps.completed_at = datetime.utcnow() if completed else None
    ps.completed_by = data.get('completed_by', '') if completed else ''
    db.session.commit()
    return jsonify(ps.to_dict())


@app.route('/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    p = Projects.query.get_or_404(project_id)

    # Delete all related data
    schedule_items = Schedule.query.filter_by(job_id=project_id).all()
    for s in schedule_items:
        ScheduleEditLog.query.filter_by(schedule_id=s.id).delete()
    Schedule.query.filter_by(job_id=project_id).delete()
    JobUsers.query.filter_by(job_id=project_id).delete()
    for co in ChangeOrders.query.filter_by(job_id=project_id).all():
        db.session.delete(co)
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
        display_with_company = f'{u.companyName} ({contractor_name})' if u.companyName else ''
        from sqlalchemy import or_
        match_clauses = [
            Schedule.contractor == contractor_name,
            Schedule.contractor == u.companyName,
        ]
        if display_with_company:
            match_clauses.append(Schedule.contractor == display_with_company)
        tasks = Schedule.query.filter(or_(*match_clauses)).all()
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
    # Build all possible display formats the frontend may have saved
    display_with_company = f'{u.companyName} ({contractor_name})' if u.companyName else ''
    from sqlalchemy import or_
    match_clauses = [
        Schedule.contractor == contractor_name,
        Schedule.contractor == u.companyName,
    ]
    if display_with_company:
        match_clauses.append(Schedule.contractor == display_with_company)
    tasks = Schedule.query.filter(or_(*match_clauses)).all()
    result = []
    # Cache project lookups and group on-hold tasks by project for preview
    proj_cache = {}
    on_hold_groups = {}  # job_id -> list of task dicts
    for t in tasks:
        if t.job_id not in proj_cache:
            proj_cache[t.job_id] = Projects.query.get(t.job_id)
        proj = proj_cache[t.job_id]
        # Non-builders only see tasks from go_live projects (unless a builder is viewing)
        if not _is_builder(viewer_role) and not _is_builder(u.role) and proj and not proj.go_live:
            continue
        td = t.to_dict()
        if proj:
            td['project_name'] = proj.name
            td['project_number'] = proj.number
            td['go_live'] = bool(proj.go_live) if proj.go_live else False
            td['on_hold'] = bool(proj.on_hold) if proj.on_hold else False
        result.append(td)
        # Collect on-hold tasks for preview adjustment
        if proj and proj.on_hold and proj.hold_start_date:
            on_hold_groups.setdefault(t.job_id, []).append(td)

    # Apply hold preview adjustments per project (needs full task list for context)
    for job_id, held_tasks in on_hold_groups.items():
        proj = proj_cache[job_id]
        # Get ALL tasks for this project so the in-progress detection works correctly
        all_proj_tasks = Schedule.query.filter_by(job_id=job_id).order_by(Schedule.start_date).all()
        all_dicts = [tp.to_dict() for tp in all_proj_tasks]
        adjusted = _apply_hold_preview(all_dicts, proj.hold_start_date)
        # Map adjusted dates back to the user's tasks
        adj_map = {a['id']: a for a in adjusted}
        for td in held_tasks:
            adj = adj_map.get(td['id'])
            if adj:
                td['start_date'] = adj['start_date']
                td['end_date'] = adj['end_date']

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
    now = datetime.utcnow()
    today = now.strftime('%Y-%m-%d')
    timestamp = now.strftime('%Y-%m-%d %H:%M:%S')
    created_by = data.get('created_by', 'builder')  # 'builder' or 'sub'
    try:
        if created_by == 'sub':
            # Sub-created: sub auto-signs, needs builder + customer approval
            co = ChangeOrders(
                job_id=pid, title=data['title'], description=data.get('description', ''),
                amount=data.get('amount', 0), status='pending_builder',
                builder_sig=False, builder_sig_date=None,
                customer_sig=False, customer_sig_date=None,
                sub_id=data.get('sub_id', None), sub_name=data.get('sub_name', None),
                sub_sig=True, sub_sig_date=timestamp,
                sub_sig_initials=data.get('sub_initials', None),
                sub_sig_name=data.get('sub_signer_name', None),
                task_id=data.get('task_id', None), task_name=data.get('task_name', None),
                task_extension_days=data.get('task_extension_days', 0),
                created_at=today, due_date=data.get('due_date', None),
            )
        else:
            # Builder-created: builder auto-signs
            co = ChangeOrders(
                job_id=pid, title=data['title'], description=data.get('description', ''),
                amount=data.get('amount', 0), status='pending_customer',
                builder_sig=True, builder_sig_date=timestamp,
                builder_sig_initials=data.get('builder_initials', None),
                builder_sig_name=data.get('builder_signer_name', None),
                customer_sig=False, customer_sig_date=None,
                sub_id=data.get('sub_id', None), sub_name=data.get('sub_name', None),
                sub_sig=False, sub_sig_date=None,
                task_id=data.get('task_id', None), task_name=data.get('task_name', None),
                task_extension_days=data.get('task_extension_days', 0),
                created_at=today, due_date=data.get('due_date', None),
            )
        db.session.add(co)
        db.session.commit()
        return jsonify(co.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/change-orders/<int:co_id>/sign', methods=['PUT'])
def sign_change_order(co_id):
    data = request.get_json()
    co = ChangeOrders.query.get_or_404(co_id)
    now = datetime.utcnow()
    today = now.strftime('%Y-%m-%d')
    timestamp = now.strftime('%Y-%m-%d %H:%M:%S')
    role = data.get('role', '')

    # Enforce due date for customer signing
    if role == 'customer' and co.due_date:
        if today > co.due_date:
            try:
                co.status = 'expired'
                db.session.commit()
            except Exception:
                db.session.rollback()
            return jsonify({'error': 'This change order has expired. The due date has passed.', 'co': co.to_dict()}), 400

    try:
        initials = data.get('initials', '')
        signer_name = data.get('signer_name', '')
        if _is_builder(role):
            co.builder_sig = True
            co.builder_sig_date = timestamp
            co.builder_sig_initials = initials
            co.builder_sig_name = signer_name
        elif role == 'customer':
            co.customer_sig = True
            co.customer_sig_date = timestamp
            co.customer_sig_initials = initials
            co.customer_sig_name = signer_name
        elif role == 'sub':
            co.sub_sig = True
            co.sub_sig_date = timestamp
            co.sub_sig_initials = initials
            co.sub_sig_name = signer_name

        # Determine if fully approved: builder + customer + sub (if sub required)
        all_signed = co.builder_sig and co.customer_sig
        if co.sub_id:
            all_signed = all_signed and co.sub_sig

        if all_signed:
            co.status = 'approved'
            # Update project contract price
            project = Projects.query.get(co.job_id)
            if project:
                approved = ChangeOrders.query.filter_by(job_id=co.job_id, status='approved').all()
                total = (project.original_price or 0) + sum(c.amount for c in approved)
                if co not in approved:
                    total += co.amount
                project.contract_price = total
            # Apply task extension if specified
            if co.task_id and co.task_extension_days:
                task = Schedule.query.get(co.task_id)
                if task and task.end_date:
                    old_end = _to_date(task.end_date)
                    new_end = _add_workdays(old_end, co.task_extension_days)
                    task.end_date = _fmt(new_end)
                    # Cascade: push all dependent tasks in the chain
                    all_items = Schedule.query.filter_by(job_id=co.job_id).all()
                    by_id = {t.id: t for t in all_items}
                    for _ in range(len(all_items) + 1):
                        changed = False
                        for t in all_items:
                            if not t.predecessor_id or t.predecessor_id not in by_id:
                                continue
                            if t.id == task.id:
                                continue
                            pred = by_id[t.predecessor_id]
                            new_start = _calc_start_from_pred(pred, t.rel_type or 'FS', t.lag_days or 0)
                            if new_start and new_start != t.start_date:
                                dur = _workday_count(t.start_date, t.end_date)
                                t.start_date = new_start
                                t.end_date = _calc_end_from_workdays(new_start, dur)
                                changed = True
                        if not changed:
                            break
                    sync_project_dates(co.job_id)
            # Copy change order documents into project Documents folder
            co_docs = ChangeOrderDocument.query.filter_by(change_order_id=co.id).all()
            for cd in co_docs:
                proj_doc = Documents(
                    job_id=co.job_id,
                    name=f"CO: {co.title} — {cd.name}",
                    category='Change Order',
                    media_type='document',
                    file_size=cd.file_size,
                    uploaded_by=cd.uploaded_by,
                    created_at=today,
                    file_url=cd.file_url,
                )
                db.session.add(proj_doc)
        else:
            if not co.builder_sig:
                co.status = 'pending_builder'
            elif not co.customer_sig:
                co.status = 'pending_customer'
            elif co.sub_id and not co.sub_sig:
                co.status = 'pending_sub'

        db.session.commit()
        return jsonify(co.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/change-orders/<int:co_id>/documents', methods=['GET'])
def get_co_documents(co_id):
    """List documents attached to a change order."""
    docs = ChangeOrderDocument.query.filter_by(change_order_id=co_id).order_by(ChangeOrderDocument.created_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])


@app.route('/change-orders/<int:co_id>/documents', methods=['POST'])
def add_co_document(co_id):
    """Attach a document to a change order."""
    ChangeOrders.query.get_or_404(co_id)
    data = request.get_json()
    today = datetime.utcnow().strftime('%Y-%m-%d')
    doc = ChangeOrderDocument(
        change_order_id=co_id,
        name=data.get('name', ''),
        description=data.get('description', ''),
        file_url=data.get('file_url', ''),
        file_size=data.get('file_size', 0),
        uploaded_by=data.get('uploaded_by', ''),
        created_at=today,
    )
    db.session.add(doc)
    db.session.commit()
    return jsonify(doc.to_dict()), 201


@app.route('/change-order-documents/<int:doc_id>', methods=['DELETE'])
def delete_co_document(doc_id):
    """Delete a change order document."""
    doc = ChangeOrderDocument.query.get_or_404(doc_id)
    if doc.file_url:
        fpath = os.path.join(UPLOAD_DIR, doc.file_url.replace('/uploads/', ''))
        if os.path.exists(fpath):
            os.remove(fpath)
    db.session.delete(doc)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/users/<int:uid>/change-orders', methods=['GET'])
def get_user_change_orders(uid):
    """Get all change orders involving a subcontractor."""
    cos = ChangeOrders.query.filter_by(sub_id=uid).order_by(ChangeOrders.created_at.desc()).all()
    result = []
    for co in cos:
        d = co.to_dict()
        proj = Projects.query.get(co.job_id)
        if proj:
            d['project_name'] = proj.name
        result.append(d)
    return jsonify(result)


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


@app.route('/upload-file', methods=['POST'])
def upload_file():
    """Accept base64 file data and save to disk"""
    data = request.get_json()
    b64 = data.get('file', '')
    if ',' in b64:
        b64 = b64.split(',', 1)[1]
    ext = data.get('ext', 'pdf')
    original_name = data.get('name', '')
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    try:
        with open(filepath, 'wb') as f:
            f.write(base64.b64decode(b64))
        file_size = os.path.getsize(filepath)
        return jsonify({'path': f'/uploads/{filename}', 'file_size': file_size, 'original_name': original_name}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/selection-items', methods=['GET'])
def get_selection_items():
    company_id = request.args.get('company_id', type=int)
    q = SelectionItem.query.order_by(SelectionItem.category, SelectionItem.item)
    if company_id:
        q = q.filter_by(company_id=company_id)
    items = q.all()
    return jsonify([i.to_dict() for i in items])


@app.route('/selection-items', methods=['POST'])
def create_selection_item():
    data = request.get_json()
    item = SelectionItem(
        category=data.get('category', ''),
        item=data.get('item', ''),
        options=json.dumps(data.get('options', [])),
        allow_multiple=bool(data.get('allow_multiple', False)),
    )
    user_id = data.get('user_id')
    if user_id:
        creator = LoginInfo.query.get(user_id)
        if creator and creator.company_id:
            item.company_id = creator.company_id
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
    if 'allow_multiple' in data: item.allow_multiple = bool(data['allow_multiple'])
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
# SELECTION TEMPLATES
# ============================================================

@app.route('/selection-templates', methods=['GET'])
def get_selection_templates():
    company_id = request.args.get('company_id', type=int)
    q = SelectionTemplate.query.order_by(SelectionTemplate.name)
    if company_id:
        q = q.filter_by(company_id=company_id)
    return jsonify([t.to_dict() for t in q.all()])


@app.route('/selection-templates', methods=['POST'])
def create_selection_template():
    data = request.get_json()
    t = SelectionTemplate(
        name=data.get('name', ''),
        item_ids_json=json.dumps(data.get('item_ids', [])),
        created_at=datetime.utcnow().strftime('%Y-%m-%d'),
    )
    user_id = data.get('user_id')
    if user_id:
        t.created_by = user_id
        creator = LoginInfo.query.get(user_id)
        if creator and creator.company_id:
            t.company_id = creator.company_id
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@app.route('/selection-templates/<int:tid>', methods=['PUT'])
def update_selection_template(tid):
    t = SelectionTemplate.query.get_or_404(tid)
    data = request.get_json()
    if 'name' in data:
        t.name = data['name']
    if 'item_ids' in data:
        t.item_ids_json = json.dumps(data['item_ids'])
    db.session.commit()
    return jsonify(t.to_dict())


@app.route('/selection-templates/<int:tid>', methods=['DELETE'])
def delete_selection_template(tid):
    t = SelectionTemplate.query.get_or_404(tid)
    # Clear template reference from any projects using this template
    Projects.query.filter_by(selection_template_id=tid).update({'selection_template_id': None})
    db.session.delete(t)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/projects/<int:pid>/apply-selection-template', methods=['POST'])
def apply_selection_template(pid):
    """Apply a selection template to a project: remove old selections, create new ones for template items only"""
    project = Projects.query.get_or_404(pid)
    data = request.get_json()
    template_id = data.get('template_id')

    # Delete existing project selections
    ProjectSelection.query.filter_by(job_id=pid).delete()

    if template_id:
        template = SelectionTemplate.query.get_or_404(template_id)
        project.selection_template_id = template_id
        item_ids = json.loads(template.item_ids_json) if template.item_ids_json else []
        for item_id in item_ids:
            item = SelectionItem.query.get(item_id)
            if item:
                ps = ProjectSelection(job_id=pid, selection_item_id=item_id, status='pending')
                db.session.add(ps)
    else:
        # Clearing template — re-create for all items
        project.selection_template_id = None
        all_items = SelectionItem.query.all()
        for item in all_items:
            ps = ProjectSelection(job_id=pid, selection_item_id=item.id, status='pending')
            db.session.add(ps)

    db.session.commit()
    # Return updated selections
    result = [ps.to_dict() for ps in ProjectSelection.query.filter_by(job_id=pid).all()]
    return jsonify(result)


# ============================================================
# SELECTIONS - PER PROJECT
# ============================================================

@app.route('/projects/<int:pid>/selections', methods=['GET'])
def get_project_selections(pid):
    """Get all selections for a project - auto-creates ProjectSelection rows for applicable catalog items.
    If the project has a selection template, only items in that template are included.
    Otherwise, all catalog items are included."""
    project = Projects.query.get_or_404(pid)
    all_items = SelectionItem.query.all()

    # Determine which items apply based on template
    template_item_ids = None
    if project.selection_template_id:
        template = SelectionTemplate.query.get(project.selection_template_id)
        if template:
            template_item_ids = set(json.loads(template.item_ids_json) if template.item_ids_json else [])

    applicable_items = [i for i in all_items if template_item_ids is None or i.id in template_item_ids]

    existing = {ps.selection_item_id: ps for ps in ProjectSelection.query.filter_by(job_id=pid).all()}
    result = []
    for item in applicable_items:
        if item.id not in existing:
            ps = ProjectSelection(job_id=pid, selection_item_id=item.id, status='pending')
            db.session.add(ps)
            existing[item.id] = ps
    db.session.commit()
    for item in applicable_items:
        ps = existing.get(item.id)
        if ps:
            result.append(ps.to_dict())
    return jsonify(result)


@app.route('/project-selections/<int:psid>', methods=['PUT'])
def update_project_selection(psid):
    ps = ProjectSelection.query.get_or_404(psid)
    data = request.get_json()
    if 'selected' in data:
        sel_val = data['selected']
        # Store as JSON string if array (multi-select), plain string if single
        if isinstance(sel_val, list):
            ps.selected = json.dumps(sel_val)
        else:
            ps.selected = sel_val
        if ps.status != 'confirmed':
            ps.status = 'selected' if ps.selected else 'pending'
    if 'price_override' in data:
        ps.price_override = float(data['price_override']) if data['price_override'] is not None else None
    if 'customer_comment' in data:
        ps.customer_comment = data['customer_comment'] or None
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
    result = [i.to_dict() for i in items]

    # Hide tasks marked hidden_from_customer when the requesting user is a customer
    user_role = getattr(request, 'current_user', {}).get('role', '')
    if user_role == 'customer':
        result = [r for r in result if not r.get('hidden_from_customer')]

    # Apply on-the-fly hold adjustments so dates extend visually while on hold
    proj = Projects.query.get(pid)
    if proj and proj.on_hold and proj.hold_start_date:
        result = _apply_hold_preview(result, proj.hold_start_date)

    return jsonify(result)


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
            # Support both single and multi contractor/trade
            contractors = d.get('contractors', [])
            if not contractors and d.get('contractor'):
                contractors = [d['contractor']]
            trades = d.get('trades', [])
            if not trades and d.get('trade'):
                trades = [d['trade']]
            item = Schedule(
                job_id=pid, task=d.get('task', ''),
                start_date=start, end_date=end,
                baseline_start=start if is_live else '', baseline_end=end if is_live else '',
                progress=d.get('progress', 0),
                contractor=contractors[0] if contractors else d.get('contractor', ''),
                trade=trades[0] if trades else d.get('trade', ''),
                contractors_json=json.dumps(contractors),
                trades_json=json.dumps(trades),
                hidden_from_customer=bool(d.get('hidden_from_customer', False)),
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
        apply_subdivision_contractors(pid)
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
    # Support both single and multi contractor/trade
    contractors = data.get('contractors', [])
    if not contractors and data.get('contractor'):
        contractors = [data['contractor']]
    trades = data.get('trades', [])
    if not trades and data.get('trade'):
        trades = [data['trade']]
    item = Schedule(
        job_id=pid, task=data.get('task', ''),
        start_date=start, end_date=end,
        baseline_start=start if is_live else '',
        baseline_end=end if is_live else '',
        progress=data.get('progress', 0),
        contractor=contractors[0] if contractors else data.get('contractor', ''),
        trade=trades[0] if trades else data.get('trade', ''),
        contractors_json=json.dumps(contractors),
        trades_json=json.dumps(trades),
        hidden_from_customer=bool(data.get('hidden_from_customer', False)),
        predecessor_id=data.get('predecessor_id'),
        rel_type=data.get('rel_type', 'FS'),
        lag_days=int(data.get('lag_days', 0)),
    )
    db.session.add(item)
    db.session.commit()
    apply_subdivision_contractors(pid)
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
              'progress', 'contractor', 'trade', 'predecessor_id', 'rel_type', 'lag_days',
              'hidden_from_customer'):
        if k in data:
            setattr(item, k, data[k])
    # Handle multi-contractor and multi-trade arrays
    if 'contractors' in data:
        item.contractors_json = json.dumps(data['contractors'])
        item.contractor = data['contractors'][0] if data['contractors'] else ''
    if 'trades' in data:
        item.trades_json = json.dumps(data['trades'])
        item.trade = data['trades'][0] if data['trades'] else ''
    db.session.commit()
    sync_project_dates(item.job_id)
    sync_linked_client_tasks([item.id])
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
    sync_linked_client_tasks([i.id for i in updated])
    return jsonify([i.to_dict() for i in updated])


@app.route('/projects/<int:pid>/assign-trade-contractor', methods=['PUT'])
def assign_trade_contractor(pid):
    """Assign a contractor to all schedule tasks matching a given trade."""
    data = request.get_json()
    trade = (data.get('trade') or '').strip()
    contractor_name = (data.get('contractor_name') or '').strip()
    if not trade:
        return jsonify({'error': 'trade is required'}), 400

    tasks = Schedule.query.filter_by(job_id=pid).all()
    updated = []
    for t in tasks:
        task_trades = t._get_trades()
        if trade in task_trades:
            if contractor_name:
                # Set (or replace) the contractor
                t.contractor = contractor_name
                t.contractors_json = json.dumps([contractor_name])
            else:
                # Unassign contractor
                t.contractor = ''
                t.contractors_json = None
            updated.append(t)
    db.session.commit()
    # Return the full updated schedule
    all_tasks = Schedule.query.filter_by(job_id=pid).order_by(Schedule.start_date).all()
    return jsonify([t.to_dict() for t in all_tasks])


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
    company_id = request.args.get('company_id', type=int)
    q = ScheduleTemplate.query.order_by(ScheduleTemplate.id.desc())
    if company_id:
        q = q.filter_by(company_id=company_id)
    templates = q.all()
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
    creator_id = data.get('created_by')
    if creator_id:
        creator = LoginInfo.query.get(creator_id)
        if creator and creator.company_id:
            tmpl.company_id = creator.company_id
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
    company_id = request.args.get('company_id', type=int)
    q = HomeTemplate.query.order_by(HomeTemplate.name)
    if company_id:
        q = q.filter_by(company_id=company_id)
    return jsonify([t.to_dict() for t in q.all()])


@app.route('/home-templates', methods=['POST'])
def create_home_template():
    data = request.get_json()
    t = HomeTemplate(
        name=data.get('name', ''), sqft=int(data.get('sqft', 0)),
        stories=int(data.get('stories', 1)), bedrooms=int(data.get('bedrooms', 0)),
        bathrooms=int(data.get('bathrooms', 0)),
    )
    user_id = data.get('user_id')
    if user_id:
        creator = LoginInfo.query.get(user_id)
        if creator and creator.company_id:
            t.company_id = creator.company_id
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


# ── Floor Plans ──────────────────────────────────────────────
@app.route('/floor-plans', methods=['GET'])
def get_floor_plans():
    company_id = request.args.get('company_id', type=int)
    q = FloorPlan.query.order_by(FloorPlan.name)
    if company_id:
        q = q.filter_by(company_id=company_id)
    return jsonify([fp.to_dict() for fp in q.all()])


@app.route('/floor-plans', methods=['POST'])
def create_floor_plan():
    data = request.get_json()
    fp = FloorPlan(name=data.get('name', ''))
    user_id = data.get('user_id')
    if user_id:
        creator = LoginInfo.query.get(user_id)
        if creator and creator.company_id:
            fp.company_id = creator.company_id
    db.session.add(fp)
    db.session.commit()
    return jsonify(fp.to_dict()), 201


@app.route('/floor-plans/<int:fid>', methods=['PUT'])
def update_floor_plan(fid):
    fp = FloorPlan.query.get_or_404(fid)
    data = request.get_json()
    if 'name' in data:
        fp.name = data['name']
    db.session.commit()
    return jsonify(fp.to_dict())


@app.route('/floor-plans/<int:fid>', methods=['DELETE'])
def delete_floor_plan(fid):
    fp = FloorPlan.query.get_or_404(fid)
    db.session.delete(fp)
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
              'predecessor_id', 'rel_type', 'lag_days', 'hidden_from_customer'):
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

    # Handle multi-contractor and multi-trade arrays
    if 'contractors' in data:
        old_json = item.contractors_json or '[]'
        new_json = json.dumps(data['contractors'])
        if old_json != new_json:
            changes.append({'field': 'contractors', 'old': old_json, 'new': new_json})
        item.contractors_json = new_json
        item.contractor = data['contractors'][0] if data['contractors'] else ''
    if 'trades' in data:
        old_json = item.trades_json or '[]'
        new_json = json.dumps(data['trades'])
        if old_json != new_json:
            changes.append({'field': 'trades', 'old': old_json, 'new': new_json})
        item.trades_json = new_json
        item.trade = data['trades'][0] if data['trades'] else ''

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

    # Propagate contractor change to all tasks with the same trade in this project
    contractor_changed = any(c['field'] in ('contractor', 'contractors') for c in changes)
    if contractor_changed and item.trade:
        all_items = Schedule.query.filter_by(job_id=item.job_id).all()
        for t in all_items:
            if t.id != item.id and t.trade == item.trade and t.contractor != item.contractor:
                t.contractor = item.contractor
    else:
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
    sync_linked_client_tasks([t.id for t in all_items])
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
    sync_linked_client_tasks([t.id for t in all_items])
    return jsonify([t.to_dict() for t in all_items]), 201


# ============================================================
# WORKDAY EXEMPTIONS
# ============================================================

@app.route('/workday-exemptions', methods=['GET'])
def get_all_workday_exemptions():
    company_id = request.args.get('company_id', type=int)
    q = WorkdayExemption.query.order_by(WorkdayExemption.date)
    if company_id:
        q = q.filter_by(company_id=company_id)
    exemptions = q.all()
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
    # Set company_id from creator
    user_id = data.get('user_id')
    if user_id:
        creator = LoginInfo.query.get(user_id)
        if creator and creator.company_id:
            exemption.company_id = creator.company_id
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
# CLIENT TASKS
# ============================================================

def sync_linked_client_tasks(schedule_ids):
    """Update due_date on client tasks linked to any of the given schedule task IDs."""
    if not schedule_ids:
        return
    linked = ClientTask.query.filter(
        ClientTask.linked_schedule_id.in_(schedule_ids),
        ClientTask.linked_date_type.isnot(None),
    ).all()
    if not linked:
        return
    # Build lookup of schedule tasks
    sched_map = {s.id: s for s in Schedule.query.filter(Schedule.id.in_(schedule_ids)).all()}
    for ct in linked:
        sched = sched_map.get(ct.linked_schedule_id)
        if not sched:
            continue
        new_date = sched.start_date if ct.linked_date_type == 'start' else sched.end_date
        if new_date and new_date != ct.due_date:
            ct.due_date = new_date
    db.session.commit()

@app.route('/projects/<int:pid>/client-tasks', methods=['GET'])
def get_client_tasks(pid):
    items = ClientTask.query.filter_by(job_id=pid).order_by(ClientTask.due_date).all()
    return jsonify([t.to_dict() for t in items])


@app.route('/projects/<int:pid>/client-tasks', methods=['POST'])
def add_client_task(pid):
    data = request.get_json()
    from datetime import datetime
    # If linked to a schedule task, resolve the due_date from that task
    linked_id = data.get('linked_schedule_id')
    linked_type = data.get('linked_date_type', '')
    due_date = data.get('due_date', '')
    if linked_id and linked_type:
        sched = Schedule.query.get(linked_id)
        if sched:
            due_date = sched.start_date if linked_type == 'start' else sched.end_date
    task = ClientTask(
        job_id=pid,
        title=data.get('title', ''),
        description=data.get('description', ''),
        due_date=due_date,
        image_url=data.get('image_url', ''),
        created_by=data.get('created_by'),
        created_at=datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
        linked_schedule_id=linked_id,
        linked_date_type=linked_type if linked_id else None,
    )
    db.session.add(task)
    db.session.commit()
    return jsonify(task.to_dict()), 201


@app.route('/client-tasks/<int:task_id>', methods=['PUT'])
def update_client_task(task_id):
    task = ClientTask.query.get_or_404(task_id)
    data = request.get_json()
    for k in ('title', 'description', 'due_date', 'image_url', 'completed', 'completed_at',
              'linked_schedule_id', 'linked_date_type'):
        if k in data:
            setattr(task, k, data[k])
    # If link was set/changed, resolve due_date from the schedule task
    if 'linked_schedule_id' in data:
        if data['linked_schedule_id'] and task.linked_date_type:
            sched = Schedule.query.get(data['linked_schedule_id'])
            if sched:
                task.due_date = sched.start_date if task.linked_date_type == 'start' else sched.end_date
        elif not data['linked_schedule_id']:
            task.linked_date_type = None
    db.session.commit()
    return jsonify(task.to_dict())


@app.route('/client-tasks/<int:task_id>', methods=['DELETE'])
def delete_client_task(task_id):
    task = ClientTask.query.get_or_404(task_id)
    db.session.delete(task)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/users/<int:uid>/client-tasks', methods=['GET'])
def get_user_client_tasks(uid):
    """Get all client tasks across all projects assigned to this user."""
    user = LoginInfo.query.get_or_404(uid)
    # Find all project IDs assigned to this user
    job_links = JobUsers.query.filter_by(user_id=uid).all()
    job_ids = [j.job_id for j in job_links]
    # Also include projects where user is the customer (primary or secondary homeowner)
    owned = Projects.query.filter(
        db.or_(Projects.customer_id == uid, Projects.homeowner2_id == uid)
    ).all()
    job_ids += [p.id for p in owned]
    job_ids = list(set(job_ids))
    if not job_ids:
        return jsonify([])
    tasks = ClientTask.query.filter(ClientTask.job_id.in_(job_ids)).order_by(ClientTask.due_date).all()
    # Include project name for each task
    proj_map = {}
    for p in Projects.query.filter(Projects.id.in_(job_ids)).all():
        proj_map[p.id] = p.name
    result = []
    for t in tasks:
        d = t.to_dict()
        d['project_name'] = proj_map.get(t.job_id, '')
        result.append(d)
    return jsonify(result)


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
        file_url=data.get('file_url', ''),
        template_id=data.get('template_id', None),
    )
    db.session.add(doc)
    db.session.commit()
    return jsonify(doc.to_dict()), 201


@app.route('/documents/<int:doc_id>', methods=['PATCH'])
def update_document(doc_id):
    """Update a document's name or other fields."""
    doc = Documents.query.get_or_404(doc_id)
    data = request.get_json()
    if 'name' in data:
        doc.name = data['name']
    db.session.commit()
    return jsonify(doc.to_dict())


@app.route('/documents/<int:doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    doc = Documents.query.get_or_404(doc_id)
    if doc.file_url:
        fpath = os.path.join(UPLOAD_DIR, doc.file_url.replace('/uploads/', ''))
        if os.path.exists(fpath):
            os.remove(fpath)
    db.session.delete(doc)
    db.session.commit()
    return jsonify({'ok': True})


# ============================================================
# SUBDIVISION DOCUMENTS
# ============================================================

@app.route('/subdivisions/<int:sid>/documents', methods=['GET'])
def get_subdivision_documents(sid):
    media_type = request.args.get('type', None)
    q = Documents.query.filter_by(subdivision_id=sid)
    if media_type:
        q = q.filter_by(media_type=media_type)
    docs = q.order_by(Documents.created_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])


@app.route('/subdivisions/<int:sid>/documents', methods=['POST'])
def add_subdivision_document(sid):
    data = request.get_json()
    doc = Documents(
        subdivision_id=sid, name=data.get('name', ''), category=data.get('category', 'General'),
        media_type=data.get('media_type', 'document'),
        file_size=data.get('file_size', 0), uploaded_by=data.get('uploaded_by', ''),
        created_at=data.get('created_at', datetime.utcnow().strftime('%Y-%m-%d')),
        file_url=data.get('file_url', ''),
        template_id=data.get('template_id', None),
    )
    db.session.add(doc)
    db.session.commit()
    return jsonify(doc.to_dict()), 201


# ============================================================
# DOCUMENT TEMPLATES (universal required documents)
# ============================================================

@app.route('/document-templates', methods=['GET'])
def get_document_templates():
    from sqlalchemy import or_
    scope = request.args.get('scope', None)  # 'projects' | 'subdivisions' | None (all)
    company_id = request.args.get('company_id', type=int)
    q = DocumentTemplate.query
    if company_id:
        q = q.filter_by(company_id=company_id)
    if scope:
        q = q.filter(or_(
            DocumentTemplate.applies_to == scope,
            DocumentTemplate.applies_to == 'both',
            DocumentTemplate.applies_to.is_(None),
        ))
    templates = q.order_by(DocumentTemplate.name).all()
    return jsonify([t.to_dict() for t in templates])


@app.route('/document-templates', methods=['POST'])
def create_document_template():
    data = request.get_json()
    t = DocumentTemplate(
        name=data.get('name', ''),
        doc_type=data.get('doc_type', 'file'),
        applies_to=data.get('applies_to', 'both'),
    )
    user_id = data.get('user_id')
    if user_id:
        creator = LoginInfo.query.get(user_id)
        if creator and creator.company_id:
            t.company_id = creator.company_id
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@app.route('/document-templates/<int:tid>', methods=['DELETE'])
def delete_document_template(tid):
    t = DocumentTemplate.query.get_or_404(tid)
    db.session.delete(t)
    db.session.commit()
    return jsonify({'ok': True})


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
                    db.session.rollback()
                    print(f"  ⚠ Failed: {stmt} — {e}")

    if changes:
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    # Ensure password column is wide enough for hashed passwords
    try:
        db.session.execute(text("ALTER TABLE login_info MODIFY COLUMN password VARCHAR(512) NOT NULL"))
        db.session.commit()
        changes.append("WIDEN login_info.password to VARCHAR(512)")
    except Exception:
        db.session.rollback()

    # Make documents.job_id nullable for subdivision documents
    try:
        db.session.execute(text("ALTER TABLE documents MODIFY COLUMN job_id INTEGER NULL"))
        db.session.commit()
        changes.append("MODIFY documents.job_id to NULLABLE")
    except Exception:
        db.session.rollback()

    # Widen trades column from VARCHAR(255) to TEXT for long trade lists
    try:
        db.session.execute(text("ALTER TABLE login_info MODIFY COLUMN trades TEXT"))
        db.session.commit()
        changes.append("WIDEN login_info.trades to TEXT")
    except Exception:
        db.session.rollback()

    # Widen project_selection.selected from VARCHAR(200) to TEXT for multi-select JSON arrays
    try:
        db.session.execute(text("ALTER TABLE project_selection MODIFY COLUMN selected TEXT"))
        db.session.commit()
        changes.append("WIDEN project_selection.selected to TEXT")
    except Exception:
        db.session.rollback()

    # Backfill NULL applies_to values to 'both'
    try:
        result = db.session.execute(text("UPDATE document_template SET applies_to = 'both' WHERE applies_to IS NULL"))
        if result.rowcount > 0:
            changes.append(f"BACKFILL document_template.applies_to: {result.rowcount} rows set to 'both'")
        db.session.commit()
    except Exception:
        db.session.rollback()

    if changes:
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    # Now create any brand new tables
    db.create_all()

    # Seed Supreme Admin — always ensure correct state
    try:
        # Migrate old admin email if it exists
        old_admin = LoginInfo.query.filter_by(username='hyrumjo253@gmail.com').first()
        if old_admin:
            db.session.delete(old_admin)
            db.session.commit()
            changes.append("REMOVE old Supreme Admin (hyrumjo253@gmail.com)")

        admin = LoginInfo.query.filter_by(username='admin_johnson@buildersync.net').first()
        if not admin:
            admin = LoginInfo(
                username='admin_johnson@buildersync.net',
                password='Totowewewe43@',
                firstName='Supreme',
                lastName='Admin',
                role='admin',
                company_id=None,
                authorized=True,
            )
            db.session.add(admin)
            db.session.commit()
            changes.append("SEED Supreme Admin user (admin_johnson@buildersync.net)")
        else:
            # Always force correct password, role, and authorization
            admin.role = 'admin'
            admin.password = generate_password_hash('Totowewewe43@')
            admin.authorized = True
            admin.company_id = None
            admin.active = True
            db.session.commit()
            changes.append("RESET Supreme Admin password and role")
    except Exception as e:
        db.session.rollback()
        print(f"  ⚠ Supreme Admin seed failed: {e}")

    if changes:
        print(f"✅ Database migration: {len(changes)} change(s)")
        for c in changes:
            print(f"   • {c}")
    else:
        print("✅ Database schema up to date — no changes needed")


# Run auto_migrate on startup (works with both direct run and Gunicorn)
with app.app_context():
    auto_migrate()

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)
