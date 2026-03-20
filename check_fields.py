import os
import sys

# Mock Odoo environment or just check files
print("Checking fields in pos_restaurant_courses...")

def check_file(path):
    if os.path.exists(path):
        print(f"File {path} exists.")
    else:
        print(f"File {path} DOES NOT exist.")

check_file("pos_restaurant_courses/models/pos_order.py")
check_file("pos_restaurant_courses/models/restaurant_order_course.py")
