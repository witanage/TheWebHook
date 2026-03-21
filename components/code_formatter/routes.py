from flask import render_template, session, request, jsonify
import re
import json

from . import code_formatter_bp
from ..utils import login_required, log


@code_formatter_bp.route("/code-formatter")
@login_required
def code_formatter():
    """Code Formatter page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed Code Formatter")
    return render_template("code-formatter.html", username=username)


@code_formatter_bp.route("/api/code-formatter/format", methods=["POST"])
@login_required
def format_code():
    """Format code based on selected mode"""
    user_id = session["user_id"]
    data = request.json

    code = data.get("code", "")
    language = data.get("language", "javascript")
    mode = data.get("mode", "standard")  # 'standard' or 'oneline'

    if not code:
        return jsonify({"success": False, "error": "No code provided"}), 400

    try:
        if mode == "oneline":
            # Convert to one line (minify)
            formatted_code = minify_code(code, language)
        else:
            # Standard IntelliJ-style formatting
            formatted_code = format_code_standard(code, language)

        log(f"User {user_id} formatted {language} code in {mode} mode")
        return jsonify({
            "success": True,
            "formatted_code": formatted_code
        })
    except Exception as e:
        log(f"Error formatting code for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


def minify_code(code, language):
    """Convert code to single line (minify)"""
    # Remove comments based on language
    if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript"]:
        # Remove single-line comments
        code = re.sub(r'//.*?$', '', code, flags=re.MULTILINE)
        # Remove multi-line comments
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    elif language in ["python", "ruby", "bash", "shell"]:
        # Remove single-line comments
        code = re.sub(r'#.*?$', '', code, flags=re.MULTILINE)
    elif language in ["sql"]:
        # Remove SQL comments
        code = re.sub(r'--.*?$', '', code, flags=re.MULTILINE)
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    elif language in ["html", "xml"]:
        # Remove HTML/XML comments
        code = re.sub(r'<!--.*?-->', '', code, flags=re.DOTALL)
    elif language in ["css", "scss", "less"]:
        # Remove CSS comments
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)

    # Replace multiple spaces with single space
    code = re.sub(r'[ \t]+', ' ', code)

    # Remove all newlines and replace with space
    code = re.sub(r'\n+', ' ', code)

    # Remove spaces around operators and special characters (language-specific)
    if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript"]:
        code = re.sub(r'\s*([{}();,:])\s*', r'\1', code)
        code = re.sub(r'\s*([=+\-*/<>!&|])\s*', r'\1', code)
    elif language == "python":
        # Python needs spaces around operators
        code = re.sub(r'\s*([{}();,:])\s*', r'\1', code)

    # Clean up extra spaces
    code = re.sub(r'\s+', ' ', code)
    code = code.strip()

    return code


def format_code_standard(code, language):
    """Format code with Postman-style beautify (2-space indentation)"""
    # Special handling for JSON
    if language == "json":
        try:
            parsed = json.loads(code)
            return json.dumps(parsed, indent=2, ensure_ascii=False)
        except:
            pass  # Fall back to regular formatting if JSON parsing fails

    # First, split code by common delimiters to ensure proper line breaks
    if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript", "css",
                    "scss", "less", "php"]:
        # Add line breaks after opening braces and before closing braces
        code = re.sub(r'\{', '{\n', code)
        code = re.sub(r'\}', '\n}\n', code)
        code = re.sub(r';', ';\n', code)
        # Clean up multiple newlines
        code = re.sub(r'\n+', '\n', code)

    lines = code.split('\n')
    formatted_lines = []
    indent_level = 0
    indent_char = '  '  # 2 spaces (Postman/Beautify style)

    for line in lines:
        stripped = line.strip()

        if not stripped:
            continue

        # Decrease indent for closing braces/brackets
        if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript",
                        "css", "scss", "less", "php", "json"]:
            if stripped.startswith('}') or stripped.startswith(']'):
                indent_level = max(0, indent_level - 1)
        elif language == "python":
            # Python indentation based on dedent keywords
            if stripped.startswith('elif ') or stripped.startswith('else:') or stripped.startswith(
                    'except') or stripped.startswith('finally:'):
                indent_level = max(0, indent_level - 1)
        elif language in ["html", "xml"]:
            if stripped.startswith('</'):
                indent_level = max(0, indent_level - 1)

        # Add indented line
        formatted_lines.append(indent_char * indent_level + stripped)

        # Increase indent for opening braces/brackets
        if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript",
                        "css", "scss", "less", "php", "json"]:
            if stripped.endswith('{') or stripped.endswith('['):
                indent_level += 1
            # Handle closing and opening on same line like "}, {"
            if re.search(r'\},\s*\{', stripped):
                indent_level = max(0, indent_level - 1)
        elif language == "python":
            # Python indentation based on colon
            if stripped.endswith(':'):
                indent_level += 1
        elif language in ["html", "xml"]:
            # HTML/XML opening tags
            if re.match(r'<[^/][^>]*>$', stripped) and not re.match(r'<[^>]*/>$', stripped):
                indent_level += 1
        elif language == "sql":
            # SQL formatting - major keywords on new lines
            if any(stripped.upper().startswith(keyword) for keyword in
                   ['FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY',
                    'HAVING']):
                indent_level = 1

    formatted_code = '\n'.join(formatted_lines)

    # Clean up excessive blank lines
    formatted_code = re.sub(r'\n{3,}', '\n\n', formatted_code)

    return formatted_code
