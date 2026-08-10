class CreateUserFiles < ActiveRecord::Migration[8.1]
  def change
    create_table :user_files do |t|
      t.string :public_id, null: false
      t.string :filename, null: false
      t.string :title, null: false
      t.string :file_type, null: false

      t.timestamps
    end
    add_index :user_files, :public_id, unique: true
  end
end
