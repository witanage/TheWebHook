# Components Directory

This directory contains modularized Flask components (Blueprints) that provide specific functionality to the application.

## Architecture

Each component is structured as a Flask Blueprint with:
- **`__init__.py`** - Blueprint initialization
- **`routes.py`** - Route handlers and business logic
- **`templates/`** - HTML templates specific to the component
- **`static/`** - CSS and JavaScript files specific to the component
  - `css/` - Component-specific stylesheets
  - `js/` - Component-specific JavaScript files

## Available Components

### 1. code_formatter
Code formatting and beautification tool supporting multiple programming languages.
- Route: `/code-formatter`
- API: `/api/code-formatter/format` (POST)

### 2. httpcodes
HTTP status code tester and documentation.
- Route: `/http-codes`

### 3. iframe_loader
Tool for loading and testing iframe content.
- Route: `/iframe-loader`

### 4. image_process
Image processing utilities (resize, convert, compress).
- Route: `/image-process`

### 5. json_compare
JSON comparison and diff tool with save/load capabilities.
- Routes:
  - Main: `/json-compare`
  - Save: `/api/json-compare/save` (POST)
  - Load: `/api/json-compare/load` (GET)
  - List: `/api/json-compare/list` (GET)
  - Delete: `/api/json-compare/delete/<id>` (DELETE)

### 6. karate_generator
Karate API test feature file generator.
- Routes:
  - Main: `/karate-generator`
  - Save: `/api/karate-generator/save` (POST)
  - Load: `/api/karate-generator/load` (GET)
  - Projects: `/api/karate-generator/projects` (GET)
  - Delete: `/api/karate-generator/delete/<id>` (DELETE)

### 7. pdf_process
PDF processing utilities (merge, split, convert).
- Route: `/pdf-process`

### 8. totp_authenticator
TOTP (Time-based One-Time Password) authenticator tool.
- Route: `/totp-authenticator`

### 9. webhook_viewer
Webhook viewer and testing interface.
- Route: `/webhook-viewer`

### 10. md_compare
Markdown file comparison with line and word-level diffs and save/load.
- Routes:
  - Main: `/md-compare`
  - Save: `/api/md-compare/save` (POST)
  - Load: `/api/md-compare/load` (GET)
  - List: `/api/md-compare/list` (GET)
  - Delete: `/api/md-compare/delete/<id>` (DELETE)

## Shared Utilities

The `utils.py` module provides shared functionality across all components:
- **`login_required`** - Authentication decorator
- **`log`** - Logging function
- **`get_db_connection`** - Database connection helper

## Adding a New Component

1. Create a new directory under `components/` with the structure:
   ```
   my_component/
   ├── __init__.py
   ├── routes.py
   ├── templates/
   └── static/
       ├── css/
       └── js/
   ```

2. In `__init__.py`, define the blueprint:
   ```python
   from flask import Blueprint

   my_component_bp = Blueprint(
       'my_component',
       __name__,
       template_folder='templates',
       static_folder='static',
       static_url_path='/components/my_component/static'
   )

   from . import routes
   ```

3. In `routes.py`, define your routes:
   ```python
   from flask import render_template, session
   from . import my_component_bp
   from ..utils import login_required, log

   @my_component_bp.route("/my-route")
   @login_required
   def my_route():
       user_id = session["user_id"]
       username = session.get("username", "User")
       log(f"User {user_id} accessed my component")
       return render_template("my-template.html", username=username)
   ```

4. Register the blueprint in `app.py`:
   ```python
   from components.my_component import my_component_bp
   app.register_blueprint(my_component_bp)
   ```

## Benefits of This Structure

- **Modularity**: Each component is self-contained
- **Maintainability**: Easy to locate and update component-specific code
- **Reusability**: Components can be easily moved or shared between projects
- **Scalability**: New features can be added without cluttering the main app
- **Testing**: Components can be tested independently
- **Future-proof**: Easier to migrate to microservices if needed
