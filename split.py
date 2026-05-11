import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract CSS
style_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
if style_match:
    css_content = style_match.group(1).strip()
    with open('style.css', 'w', encoding='utf-8') as f:
        f.write(css_content)

# Extract JS
script_match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
if script_match:
    js_content = script_match.group(1).strip()
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(js_content)

# Replace in index.html
new_content = re.sub(r'<style>.*?</style>', '<link rel="stylesheet" href="style.css">', content, flags=re.DOTALL)
new_content = re.sub(r'<script>.*?</script>', '<script src="app.js"></script>', new_content, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Split completed successfully.")
