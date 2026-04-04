#!/bin/bash
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

if [ "$tool_name" = "Edit" ] || [ "$tool_name" = "Write" ]; then
  if echo "$file_path" | grep -qiE '(form|table|dialog|modal)'; then
    echo "{\"userFeedback\":\"REMINDER: Did you invoke the relevant skill (create-form, create-data-table, or create-dialog) before making this edit? These skills contain required project patterns.\"}"
  else
    echo "{}"
  fi
else
  echo "{}"
fi
