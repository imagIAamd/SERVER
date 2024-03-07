#!/bin/bash

# Prompt for username and password
read -p "Enter the username: " username
read -s -p "Enter the password: " password
echo

# MySQL connection details
mysql_user="your_mysql_user"
mysql_password="your_mysql_password"
mysql_database="your_mysql_database"

# Execute MySQL queries to create the user
mysql --user="$admin" --password="$1234" --database="$dbapi" <<EOF
USE dbapi;
INSERT INTO User (nickname, password, email, phone_number) VALUES ('$username', '$password', 'null', '$username');
INSERT INTO User_x_Group (user_id, group_id) VALUES ((SELECT user_id FROM User WHERE nickname = '$username' AND password = '$password' LIMIT 1), 1);
EOF

echo "Admin '$username' created successfully".
