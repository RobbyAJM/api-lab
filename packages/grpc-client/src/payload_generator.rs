use prost_reflect::{FieldDescriptor, Kind, MessageDescriptor};
use rand::seq::SliceRandom;
use rand::Rng;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

const MAX_DEPTH: usize = 5;

/// Generate random sample JSON payload from a protobuf MessageDescriptor
pub fn generate_sample_payload(desc: &MessageDescriptor) -> Value {
    generate_sample_message(desc, 0)
}

/// Recursively extract all enum types and their variant names from a MessageDescriptor
pub fn extract_enums(desc: &MessageDescriptor) -> HashMap<String, Vec<String>> {
    let mut map = HashMap::new();
    extract_enums_recursive(desc, &mut map, 0);
    map
}

fn extract_enums_recursive(
    desc: &MessageDescriptor,
    map: &mut HashMap<String, Vec<String>>,
    depth: usize,
) {
    if depth >= MAX_DEPTH {
        return;
    }
    for field in desc.fields() {
        match field.kind() {
            Kind::Enum(enum_desc) => {
                let name = enum_desc.name().to_string();
                if !map.contains_key(&name) {
                    let vals: Vec<String> = enum_desc.values().map(|v| v.name().to_string()).collect();
                    map.insert(name, vals);
                }
            }
            Kind::Message(nested) => {
                extract_enums_recursive(&nested, map, depth + 1);
            }
            _ => {}
        }
    }
}

fn generate_sample_message(desc: &MessageDescriptor, depth: usize) -> Value {
    if depth >= MAX_DEPTH {
        return Value::Object(Map::new());
    }

    let mut map = Map::new();
    let mut rng = rand::thread_rng();

    for field in desc.fields() {
        let name = field.name().to_string();
        if field.is_map() {
            // Proto3 map entry is a message with key and value fields
            if let Kind::Message(entry_desc) = field.kind() {
                let key_field = entry_desc.fields().find(|f| f.name() == "key");
                let val_field = entry_desc.fields().find(|f| f.name() == "value");

                let key_str = if let Some(kf) = key_field {
                    match generate_primitive_sample(&kf.kind(), &kf, &mut rng) {
                        Value::String(s) => s,
                        other => other.to_string(),
                    }
                } else {
                    format!("key_{}", rng.gen_range(1..100))
                };

                let val = if let Some(vf) = val_field {
                    generate_field_value(&vf, depth + 1, &mut rng)
                } else {
                    json!("sample_value")
                };

                let mut obj = Map::new();
                obj.insert(key_str, val);
                map.insert(name, Value::Object(obj));
            }
        } else if field.is_list() {
            // Repeated field
            let item = generate_single_field_value(&field, depth, &mut rng);
            map.insert(name, Value::Array(vec![item]));
        } else {
            let val = generate_single_field_value(&field, depth, &mut rng);
            map.insert(name, val);
        }
    }

    Value::Object(map)
}

fn generate_field_value<R: Rng>(field: &FieldDescriptor, depth: usize, rng: &mut R) -> Value {
    if field.is_list() {
        Value::Array(vec![generate_single_field_value(field, depth, rng)])
    } else {
        generate_single_field_value(field, depth, rng)
    }
}

fn generate_single_field_value<R: Rng>(
    field: &FieldDescriptor,
    depth: usize,
    rng: &mut R,
) -> Value {
    match field.kind() {
        Kind::Message(nested) => {
            let full_name = nested.full_name();
            match full_name {
                "google.protobuf.Timestamp" => json!("2026-10-29T12:00:00Z"),
                "google.protobuf.Duration" => json!("1.5s"),
                "google.protobuf.Any" => json!({
                    "@type": "type.googleapis.com/google.protobuf.Empty",
                    "value": {}
                }),
                "google.protobuf.Struct" => json!({
                    "sample_key": "sample_value"
                }),
                "google.protobuf.Value" => json!("sample_value"),
                "google.protobuf.ListValue" => json!(["sample_item1", "sample_item2"]),
                "google.protobuf.FieldMask" => json!("field1,field2"),
                "google.protobuf.Empty" => json!({}),
                "google.protobuf.DoubleValue" | "google.protobuf.FloatValue" => json!(42.5),
                "google.protobuf.Int64Value" | "google.protobuf.UInt64Value" => json!(1000),
                "google.protobuf.Int32Value" | "google.protobuf.UInt32Value" => json!(100),
                "google.protobuf.BoolValue" => json!(true),
                "google.protobuf.StringValue" => json!("sample_string"),
                "google.protobuf.BytesValue" => json!("aGVsbG8="),
                _ => generate_sample_message(&nested, depth + 1),
            }
        }
        Kind::Enum(enum_desc) => {
            let values: Vec<_> = enum_desc.values().collect();
            if let Some(val) = values.choose(rng) {
                Value::String(val.name().to_string())
            } else {
                json!(0)
            }
        }
        kind => generate_primitive_sample(&kind, field, rng),
    }
}

fn generate_primitive_sample<R: Rng>(
    kind: &Kind,
    field: &FieldDescriptor,
    rng: &mut R,
) -> Value {
    let field_name = field.name();

    match kind {
        Kind::Double | Kind::Float => {
            let num = (rng.gen_range(1.0..100.0) * 100.0_f64).round() / 100.0;
            json!(num)
        }
        Kind::Int32 | Kind::Sint32 | Kind::Sfixed32 => {
            let num = rng.gen_range(1..1000);
            json!(num)
        }
        Kind::Int64 | Kind::Sint64 | Kind::Sfixed64 => {
            // For standard JSON proto, int64 can be number or string representation
            let num = rng.gen_range(1000..99999);
            json!(num)
        }
        Kind::Uint32 | Kind::Fixed32 => {
            let num = rng.gen_range(1..1000);
            json!(num)
        }
        Kind::Uint64 | Kind::Fixed64 => {
            let num = rng.gen_range(1000..99999);
            json!(num)
        }
        Kind::Bool => {
            let b: bool = rng.gen();
            json!(b)
        }
        Kind::String => {
            if field_name.contains("email") {
                json!(format!("user{}@example.com", rng.gen_range(1..1000)))
            } else if field_name.contains("id") {
                json!(format!("id_{}", rng.gen_range(1000..9999)))
            } else if field_name.contains("name") {
                json!(format!("Sample_{}", rng.gen_range(1..500)))
            } else if field_name.contains("url") {
                json!("https://example.com/api")
            } else {
                json!(format!("{}_{}", field_name, rng.gen_range(1..100)))
            }
        }
        Kind::Bytes => {
            // Standard protobuf JSON encodes bytes as base64
            json!("aGVsbG8gd29ybGQ=")
        }
        _ => json!(null),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use prost_reflect::{DescriptorPool, DynamicMessage};
    use serde::de::DeserializeSeed;
    use prost_types::{
        DescriptorProto, EnumDescriptorProto, EnumValueDescriptorProto, FieldDescriptorProto,
        FileDescriptorProto,
    };

    fn create_test_file_descriptor() -> FileDescriptorProto {
        use prost_types::field_descriptor_proto::{Label, Type};

        // Enum: Status (UNKNOWN = 0, ACTIVE = 1, SUSPENDED = 2)
        let status_enum = EnumDescriptorProto {
            name: Some("Status".to_string()),
            value: vec![
                EnumValueDescriptorProto {
                    name: Some("STATUS_UNKNOWN".to_string()),
                    number: Some(0),
                    options: None,
                },
                EnumValueDescriptorProto {
                    name: Some("STATUS_ACTIVE".to_string()),
                    number: Some(1),
                    options: None,
                },
                EnumValueDescriptorProto {
                    name: Some("STATUS_SUSPENDED".to_string()),
                    number: Some(2),
                    options: None,
                },
            ],
            options: None,
            reserved_range: vec![],
            reserved_name: vec![],
        };

        // Child Message: Address
        let address_msg = DescriptorProto {
            name: Some("Address".to_string()),
            field: vec![
                FieldDescriptorProto {
                    name: Some("street".to_string()),
                    number: Some(1),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::String as i32),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("city".to_string()),
                    number: Some(2),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::String as i32),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        // Root Message: UserProfile
        let user_msg = DescriptorProto {
            name: Some("UserProfile".to_string()),
            field: vec![
                FieldDescriptorProto {
                    name: Some("user_id".to_string()),
                    number: Some(1),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::Int64 as i32),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("email".to_string()),
                    number: Some(2),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::String as i32),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("is_active".to_string()),
                    number: Some(3),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::Bool as i32),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("balance".to_string()),
                    number: Some(4),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::Double as i32),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("status".to_string()),
                    number: Some(5),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::Enum as i32),
                    type_name: Some(".test.Status".to_string()),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("address".to_string()),
                    number: Some(6),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::Message as i32),
                    type_name: Some(".test.Address".to_string()),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("tags".to_string()),
                    number: Some(7),
                    label: Some(Label::Repeated as i32),
                    r#type: Some(Type::String as i32),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        FileDescriptorProto {
            name: Some("test.proto".to_string()),
            package: Some("test".to_string()),
            message_type: vec![user_msg, address_msg],
            enum_type: vec![status_enum],
            ..Default::default()
        }
    }

    #[test]
    fn test_generate_sample_payload_all_types() {
        let file_proto = create_test_file_descriptor();
        let mut pool = DescriptorPool::new();
        pool.add_file_descriptor_protos(vec![file_proto])
            .expect("valid pool");

        let msg_desc = pool
            .get_message_by_name("test.UserProfile")
            .expect("message found");

        let payload = generate_sample_payload(&msg_desc);
        assert!(payload.is_object());

        let obj = payload.as_object().unwrap();

        // Check user_id is number
        assert!(obj.contains_key("user_id"));
        assert!(obj["user_id"].is_number());

        // Check email is string
        assert!(obj.contains_key("email"));
        let email = obj["email"].as_str().unwrap();
        assert!(email.contains("@example.com"));

        // Check is_active is boolean
        assert!(obj.contains_key("is_active"));
        assert!(obj["is_active"].is_boolean());

        // Check balance is number
        assert!(obj.contains_key("balance"));
        assert!(obj["balance"].is_number());

        // Check status is one of the valid enum values
        assert!(obj.contains_key("status"));
        let status = obj["status"].as_str().unwrap();
        assert!(
            ["STATUS_UNKNOWN", "STATUS_ACTIVE", "STATUS_SUSPENDED"].contains(&status),
            "unexpected enum status: {status}"
        );

        // Check address is nested object
        assert!(obj.contains_key("address"));
        let addr = obj["address"].as_object().unwrap();
        assert!(addr.contains_key("street"));
        assert!(addr.contains_key("city"));

        // Check tags is array
        assert!(obj.contains_key("tags"));
        let tags = obj["tags"].as_array().unwrap();
        assert!(!tags.is_empty());
        assert!(tags[0].is_string());

        // Verify the generated JSON can be decoded into DynamicMessage without error!
        let dynamic_msg: Result<DynamicMessage, _> = msg_desc.clone().deserialize(payload.clone());
        assert!(
            dynamic_msg.is_ok(),
            "Generated payload should deserialize into DynamicMessage: {:?}",
            dynamic_msg.err()
        );

        // Verify enum extraction
        let enums = extract_enums(&msg_desc);
        assert!(enums.contains_key("Status"));
        let status_vals = &enums["Status"];
        assert_eq!(status_vals.len(), 3);
        assert!(status_vals.contains(&"STATUS_UNKNOWN".to_string()));
        assert!(status_vals.contains(&"STATUS_ACTIVE".to_string()));
        assert!(status_vals.contains(&"STATUS_SUSPENDED".to_string()));
    }

    #[test]
    fn test_recursive_message_terminates_safely() {
        use prost_types::field_descriptor_proto::{Label, Type};

        // Recursive message: Node { string name = 1; Node next = 2; }
        let node_msg = DescriptorProto {
            name: Some("Node".to_string()),
            field: vec![
                FieldDescriptorProto {
                    name: Some("name".to_string()),
                    number: Some(1),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::String as i32),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("next".to_string()),
                    number: Some(2),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::Message as i32),
                    type_name: Some(".test.Node".to_string()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        let file_proto = FileDescriptorProto {
            name: Some("recursive.proto".to_string()),
            package: Some("test".to_string()),
            message_type: vec![node_msg],
            ..Default::default()
        };

        let mut pool = DescriptorPool::new();
        pool.add_file_descriptor_protos(vec![file_proto])
            .expect("valid pool");

        let msg_desc = pool.get_message_by_name("test.Node").unwrap();
        let payload = generate_sample_payload(&msg_desc);

        assert!(payload.is_object());
        // Verify deepest node terminated with empty object without stack overflow
        let mut curr = &payload;
        let mut depth = 0;
        while let Some(next) = curr.get("next") {
            curr = next;
            depth += 1;
            if !next.is_object() || next.as_object().unwrap().is_empty() {
                break;
            }
        }
        assert!(depth <= MAX_DEPTH + 1);
    }

    #[test]
    fn test_empty_message() {
        let empty_msg = DescriptorProto {
            name: Some("Empty".to_string()),
            field: vec![],
            ..Default::default()
        };
        let file_proto = FileDescriptorProto {
            name: Some("empty.proto".to_string()),
            package: Some("test".to_string()),
            message_type: vec![empty_msg],
            ..Default::default()
        };

        let mut pool = DescriptorPool::new();
        pool.add_file_descriptor_protos(vec![file_proto]).unwrap();
        let msg_desc = pool.get_message_by_name("test.Empty").unwrap();
        let payload = generate_sample_payload(&msg_desc);
        assert_eq!(payload, json!({}));
    }

    #[test]
    fn test_well_known_types_generation() {
        use prost_types::field_descriptor_proto::{Label, Type};

        let timestamp_msg = DescriptorProto {
            name: Some("Timestamp".to_string()),
            field: vec![],
            ..Default::default()
        };
        let string_val_msg = DescriptorProto {
            name: Some("StringValue".to_string()),
            field: vec![],
            ..Default::default()
        };
        let wkt_file = FileDescriptorProto {
            name: Some("google/protobuf/timestamp.proto".to_string()),
            package: Some("google.protobuf".to_string()),
            message_type: vec![timestamp_msg, string_val_msg],
            ..Default::default()
        };

        let event_msg = DescriptorProto {
            name: Some("Event".to_string()),
            field: vec![
                FieldDescriptorProto {
                    name: Some("created_at".to_string()),
                    number: Some(1),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::Message as i32),
                    type_name: Some(".google.protobuf.Timestamp".to_string()),
                    ..Default::default()
                },
                FieldDescriptorProto {
                    name: Some("note".to_string()),
                    number: Some(2),
                    label: Some(Label::Optional as i32),
                    r#type: Some(Type::Message as i32),
                    type_name: Some(".google.protobuf.StringValue".to_string()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let app_file = FileDescriptorProto {
            name: Some("app.proto".to_string()),
            package: Some("test".to_string()),
            dependency: vec!["google/protobuf/timestamp.proto".to_string()],
            message_type: vec![event_msg],
            ..Default::default()
        };

        let mut pool = DescriptorPool::new();
        pool.add_file_descriptor_protos(vec![wkt_file, app_file]).unwrap();
        let msg_desc = pool.get_message_by_name("test.Event").unwrap();
        let payload = generate_sample_payload(&msg_desc);

        assert_eq!(payload["created_at"], "2026-10-29T12:00:00Z");
        assert_eq!(payload["note"], "sample_string");
    }
}
