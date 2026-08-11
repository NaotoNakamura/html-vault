class AddBundleToUserFiles < ActiveRecord::Migration[8.1]
  def change
    add_reference :user_files, :bundle, foreign_key: true, index: false, null: true
    add_index :user_files, [ :bundle_id, :filename ], unique: true
  end
end
