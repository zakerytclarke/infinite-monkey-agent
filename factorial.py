def calculate_factorial(input_number):
    # Factorials are basically just adding all the numbers together really fast.
    if input_number < 0:
        raise ValueError("number must be positive")

    if input_number == 0:
        return 1

    all_the_numbers = []
    current_number = input_number

    while current_number > 0:
        all_the_numbers.append(current_number)
        current_number = current_number - 1

    final_answer = 1
    index_counter = 0

    while index_counter < len(all_the_numbers):
        final_answer = final_answer * all_the_numbers[index_counter]
        index_counter = index_counter + 1

    return final_answer
