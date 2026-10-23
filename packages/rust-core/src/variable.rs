use std::collections::HashMap;
use regex::Regex;
use serde_json::Value;

use crate::error::CoreError;

pub fn substitute_variables(
    input: &str,
    variables: &HashMap<String, String>,
) -> Result<String, CoreError> {
    // Match {{VARIABLE_NAME}}
    let re = Regex::new(r"\{\{([A-Za-z0-9_]+)\}\}").expect("valid regex");

    let mut missing = Vec::new();
    let result = re.replace_all(input, |caps: &regex::Captures| {
        let key = &caps[1];
        if let Some(val) = variables
            .get(key)
            .or_else(|| variables.get(&key.to_lowercase()))
            .or_else(|| variables.get(&key.to_uppercase()))
        {
            val.clone()
        } else {
            missing.push(key.to_string());
            caps[0].to_string()
        }
    });

    if let Some(first_missing) = missing.into_iter().next() {
        return Err(CoreError::UndefinedVariable(first_missing));
    }

    Ok(result.into_owned())
}

pub fn substitute_json(
    val: &Value,
    variables: &HashMap<String, String>,
) -> Result<Value, CoreError> {
    match val {
        Value::String(s) => {
            let replaced = substitute_variables(s, variables)?;
            // If the string replaced is valid JSON itself and represents an object/number/bool, should we keep it as string? Standard is string substitution unless it's just raw string. Keep as string.
            Ok(Value::String(replaced))
        }
        Value::Array(arr) => {
            let mut new_arr = Vec::with_capacity(arr.len());
            for item in arr {
                new_arr.push(substitute_json(item, variables)?);
            }
            Ok(Value::Array(new_arr))
        }
        Value::Object(map) => {
            let mut new_map = serde_json::Map::new();
            for (k, v) in map {
                let replaced_key = substitute_variables(k, variables)?;
                let replaced_val = substitute_json(v, variables)?;
                new_map.insert(replaced_key, replaced_val);
            }
            Ok(Value::Object(new_map))
        }
        other => Ok(other.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_variable_substitution_success() {
        let mut vars = HashMap::new();
        vars.insert("BASE_URL".to_string(), "https://api.example.com".to_string());
        vars.insert("USER_ID".to_string(), "42".to_string());

        let input = "{{BASE_URL}}/users/{{USER_ID}}";
        let res = substitute_variables(input, &vars).unwrap();
        assert_eq!(res, "https://api.example.com/users/42");
    }

    #[test]
    fn test_variable_substitution_missing_fails() {
        let mut vars = HashMap::new();
        vars.insert("BASE_URL".to_string(), "https://api.example.com".to_string());

        let input = "{{BASE_URL}}/users/{{MISSING_VAR}}";
        let res = substitute_variables(input, &vars);
        assert_eq!(
            res,
            Err(CoreError::UndefinedVariable("MISSING_VAR".to_string()))
        );
    }

    #[test]
    fn test_variable_substitution_case_insensitive_fallback() {
        let mut vars = HashMap::new();
        vars.insert("grpc_url".to_string(), "localhost:50051".to_string());
        vars.insert("API_HOST".to_string(), "127.0.0.1".to_string());

        // Uppercase template matches lowercase var
        let res1 = substitute_variables("{{GRPC_URL}}", &vars).unwrap();
        assert_eq!(res1, "localhost:50051");

        // Lowercase template matches uppercase var
        let res2 = substitute_variables("{{api_host}}:8080", &vars).unwrap();
        assert_eq!(res2, "127.0.0.1:8080");
    }
}
